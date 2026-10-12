"""Cloux web messenger. Persistent storage must be configured for production."""
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
import uuid
from collections import defaultdict, deque
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

BASE = Path(__file__).parent
DATA = Path(os.getenv("CLOUX_DATA", str(BASE / "data")))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / "cloux.db"
app = FastAPI(title="Cloux Early Access", docs_url=None, redoc_url=None)
requests_by_ip = defaultdict(deque)

@contextmanager
def db():
    if os.getenv('DATABASE_URL'):
        from cloux_db import connect
        with connect(os.environ['DATABASE_URL']) as c:
            yield c
        return
    c = sqlite3.connect(DB, timeout=12)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    try:
        yield c
    except BaseException:
        c.rollback()
        raise
    else:
        c.commit()
    finally:
        c.close()

with db() as c:
    c.executescript("""
    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY, phone TEXT NOT NULL UNIQUE, username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display TEXT NOT NULL, password_hash TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(
      token TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS chats(
      id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_members(
      chat_id TEXT NOT NULL REFERENCES chats(id), user_id TEXT NOT NULL REFERENCES users(id),
      PRIMARY KEY(chat_id,user_id));
    CREATE TABLE IF NOT EXISTS messages(
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL REFERENCES chats(id),
      sender TEXT NOT NULL REFERENCES users(id), text TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_by_chat ON messages(chat_id,id);
    """)

class Login(BaseModel):
    phone: str
    password: str

class Message(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

class Group(BaseModel):
    title: str = Field(min_length=2, max_length=65)
    members: list[str] = Field(default_factory=list, max_length=30)

def fail(msg, status=400):
    raise HTTPException(status_code=status, detail=msg)

def limit(request, max_calls=24, period=60):
    ip = (request.client.host if request.client else "unknown")
    now = time.monotonic()
    q = requests_by_ip[(ip, request.url.path)]
    while q and now - q[0] > period: q.popleft()
    if len(q) >= max_calls: fail("Забагато спроб. Спробуйте пізніше.", 429)
    q.append(now)

def hash_password(password: str, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 240000)
    return salt.hex() + ":" + digest.hex()

def check_password(password, stored):
    if stored.startswith("$argon2"):
        from argon2.exceptions import VerifyMismatchError, VerificationError
        try:
            return cloux_auth.HASHER.verify(stored,password)
        except (VerifyMismatchError,VerificationError,ValueError):
            return False
    try:
        salt_hex, digest_hex = stored.split(":")
        test = hash_password(password, bytes.fromhex(salt_hex)).split(":")[1]
        return hmac.compare_digest(test, digest_hex)
    except Exception:
        return False

def auth(request):
    token = request.cookies.get("cloux_session")
    if not token:
        fail("Увійдіть до акаунта.", 401)
    with db() as c:
        x = c.execute("""SELECT users.id, users.username, users.display, users.created FROM sessions
            JOIN users ON users.id=sessions.uid WHERE sessions.token=? AND sessions.expires>?""",
            (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
    if not x: fail("Сесія недійсна. Увійдіть повторно.", 401)
    result = dict(x)
    with db() as c:
        if cloux_admin.moderation(c, result["id"])["blocked"]:
            fail("Цей акаунт заблоковано.", 403)
        result["is_admin"] = cloux_admin.is_owner(c, result["id"])
        result["can_verify_owner"] = cloux_admin.candidate(c, result["id"]) and not result["is_admin"]
        result["badges"] = [r["badge_id"] for r in c.execute("SELECT badge_id FROM user_badges WHERE user_id=?", (result["id"],))]
    return result

def set_cookie(response, user_id):
    secret = secrets.token_urlsafe(42)
    expires = int(time.time()) + 180*86400
    with db() as c:
        c.execute("INSERT INTO sessions(token,uid,expires) VALUES(?,?,?)",
                  (hashlib.sha256(secret.encode()).hexdigest(), user_id, expires))
    response.set_cookie("cloux_session", secret, max_age=180*86400,
                        httponly=True, secure=True, samesite="lax", path="/")
    return response

def member(c, uid, chat_id):
    return c.execute("SELECT 1 FROM chat_members WHERE user_id=? AND chat_id=?",(uid,chat_id)).fetchone()

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    # Enforce global feature flags for the corresponding API operations.
    api_path = request.url.path
    if api_path.startswith("/api/") and request.method in ("POST", "PUT", "PATCH", "DELETE"):
        with db() as c:
            if not api_path.startswith(("/api/admin/", "/api/account/", "/api/login", "/api/logout", "/api/v6/login", "/api/v6/register")) and cloux_admin.flag(c, "maintenance"):
                return JSONResponse({"detail": "Cloux тимчасово на обслуговуванні."}, status_code=503)
            flag_name = (
                "groups" if api_path in ("/api/groups", "/api/servers") else
                "channels" if api_path.endswith("/channels") and api_path.startswith("/api/servers/") else
                "reactions" if api_path.startswith("/api/messages/") and api_path.endswith("/reactions") else None
            )
            if flag_name and not cloux_admin.flag(c, flag_name):
                return JSONResponse({"detail": "Ця функція тимчасово вимкнена."}, status_code=403)
    # Cookie authentication needs server-side same-origin validation on writes.
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        origin = request.headers.get("origin", "")
        host = request.headers.get("host", "")
        if origin and origin not in ("https://" + host, "http://" + host):
            return JSONResponse({"detail": "Недозволений запит з іншого сайту."}, status_code=403)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Frame-Options"] = "DENY"
    path = request.url.path
    offline = path in ("/offline", "/offline/")
    no_store = (offline or path.startswith("/api/") or path == "/download"
                or path in ("/v5", "/v5/") or path.endswith("/index.html"))
    response.headers["Cache-Control"] = "no-store" if no_store else "public,max-age=3600"
    if offline:
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; "
            "img-src data:; base-uri 'none'; form-action 'none'"
        )
    return response

@app.get("/")
def home():
    from fastapi.responses import RedirectResponse
    return RedirectResponse("/v5/",status_code=307)

@app.get("/classic")
def classic():
    from fastapi.responses import RedirectResponse
    return RedirectResponse("/v5/",status_code=308)

@app.get("/api/health")
def health():
    return {"status":"ok","app":"cloux","stage":"early-access","persistent_storage": bool(os.getenv("DATABASE_URL")) or os.getenv("CLOUX_PERSISTENT_STORAGE") == "1"}

@app.get("/api/me")
def me(request: Request):
    user = auth(request)
    token = request.cookies.get("cloux_session","")
    if token:
        with db() as c:
            c.execute("UPDATE sessions SET expires=? WHERE token=?",
                (int(time.time())+180*86400,hashlib.sha256(token.encode()).hexdigest()))
    response = JSONResponse(user)
    response.set_cookie("cloux_session",token,max_age=180*86400,
        httponly=True,secure=True,samesite="lax",path="/")
    return response

@app.post("/api/login")
def login(payload: Login, request: Request):
    limit(request, 10)
    phone = re.sub(r"[\s()\-]", "", payload.phone)
    with db() as c:
        found=c.execute("SELECT id,password_hash FROM users WHERE phone=?",(phone,)).fetchone()
    if not found or not check_password(payload.password,found["password_hash"]):
        fail("Неправильний номер або пароль.",401)
    return set_cookie(JSONResponse({"ok":True}),found["id"])

@app.post("/api/logout")
def logout(request: Request):
    token = request.cookies.get("cloux_session")
    if token:
        with db() as c: c.execute("DELETE FROM sessions WHERE token=?",(hashlib.sha256(token.encode()).hexdigest(),))
    response=JSONResponse({"ok":True})
    response.delete_cookie("cloux_session",path="/")
    return response

@app.get("/api/users")
def users(request: Request, q: str = ""):
    me=auth(request)
    needle=q.strip().lower()
    if len(needle)<2: return {"users":[]}
    with db() as c:
        rows=c.execute("""SELECT id,username,display FROM users WHERE id!=? AND id!='cloux-system'
           AND (username LIKE ? OR display LIKE ?)
           AND NOT EXISTS (SELECT 1 FROM cloux_preferences p WHERE p.uid=users.id AND p.searchable=0)
           LIMIT 20""", (me["id"],"%"+needle+"%","%"+needle+"%")).fetchall()
    with db() as c:
        result = []
        for x in rows:
            item = dict(x)
            item["badges"] = [b["badge_id"] for b in c.execute(
                "SELECT badge_id FROM user_badges WHERE user_id=?", (item["id"],))]
            result.append(item)
    return {"users":result}

@app.post("/api/direct/{other_id}")
def direct(other_id: str, request: Request):
    user=auth(request)
    if other_id==user["id"] or other_id=="cloux-system": fail("Не можна створити цей чат.")
    with db() as c:
        other=c.execute("SELECT username,display FROM users WHERE id=?",(other_id,)).fetchone()
        if not other: fail("Користувача не знайдено.",404)
        existing=c.execute("""SELECT a.chat_id FROM chat_members a JOIN chat_members b ON a.chat_id=b.chat_id
            JOIN chats t ON t.id=a.chat_id
            WHERE a.user_id=? AND b.user_id=? AND t.kind='direct' LIMIT 1""",
            (user["id"],other_id)).fetchone()
        if existing: return {"chat_id":existing["chat_id"]}
        chat_id=str(uuid.uuid4())
        c.execute("INSERT INTO chats(id,title,kind,created) VALUES(?,?,?,?)",
                (chat_id,other["display"],"direct",int(time.time())))
        c.executemany("INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)",
                      [(chat_id,user["id"]),(chat_id,other_id)])
    return {"chat_id":chat_id}

@app.post("/api/groups")
def new_group(payload: Group, request: Request):
    user=auth(request)
    members=list(set([user["id"]]+payload.members))
    if len(members)>30: fail("Забагато учасників.")
    cid=str(uuid.uuid4())
    with db() as c:
        existing=c.execute("SELECT id FROM users WHERE id IN ("+",".join("?" for _ in members)+")",members).fetchall()
        if len(existing)!=len(members): fail("Не всіх учасників знайдено.")
        c.execute("INSERT INTO chats(id,title,kind,created) VALUES(?,?,?,?)",
            (cid,payload.title.strip(),"group",int(time.time())))
        c.executemany("INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)",[(cid,x) for x in members])
    return {"chat_id":cid}

@app.get("/api/chats")
def chats(request: Request):
    user=auth(request)
    cloux_features.seed_user(db,user["id"])
    with db() as c:
        rows=c.execute("""SELECT ch.id,ch.kind,ch.title,
           (SELECT m.text FROM messages m WHERE m.chat_id=ch.id ORDER BY m.id DESC LIMIT 1) last_text,
           (SELECT m.created FROM messages m WHERE m.chat_id=ch.id ORDER BY m.id DESC LIMIT 1) last_time,
           (SELECT m.id FROM messages m WHERE m.chat_id=ch.id ORDER BY m.id DESC LIMIT 1) last_message_id,
           (SELECT m.sender FROM messages m WHERE m.chat_id=ch.id ORDER BY m.id DESC LIMIT 1) last_sender
           FROM chats ch JOIN chat_members cm ON cm.chat_id=ch.id WHERE cm.user_id=?
           ORDER BY ch.created DESC LIMIT 200""",(user["id"],)).fetchall()
        result=[]
        for row in rows:
            d=dict(row)
            if d["kind"]=="direct":
                other=c.execute("""SELECT u.id,u.display,u.username FROM users u JOIN chat_members m ON m.user_id=u.id
                  WHERE m.chat_id=? AND u.id!=? LIMIT 1""",(d["id"],user["id"])).fetchone()
                if other:
                    d["title"]=other["display"]
                    d["other_id"]=other["id"]
                    d["badges"]=[b["badge_id"] for b in c.execute(
                        "SELECT badge_id FROM user_badges WHERE user_id=?", (other["id"],))]
            if d["kind"] in ("channel", "news", "group"):
                d["subscribers"]=c.execute("SELECT count(*) n FROM chat_members WHERE chat_id=?",
                                           (d["id"],)).fetchone()["n"]
            pr=c.execute("SELECT pinned,archived,muted FROM cloux_chat_prefs WHERE uid=? AND chat_id=?", (user["id"],d["id"])).fetchone()
            d.update(dict(pr) if pr else {"pinned":0,"archived":0,"muted":0})
            owner=c.execute("SELECT owner_id FROM cloux_owners WHERE chat_id=?",(d["id"],)).fetchone()
            d["is_owner"]=bool(owner and owner["owner_id"]==user["id"])
            result.append(d)
    result.sort(key=lambda x:(x["pinned"],x["last_time"] or 0),reverse=True)
    return {"chats":result}

@app.get("/api/chats/{chat_id}/messages")
def messages(chat_id: str, request: Request, after: int = 0):
    user=auth(request)
    with db() as c:
        if not member(c,user["id"],chat_id): fail("Немає доступу.",403)
        rows=c.execute("""SELECT m.id,m.text,m.created,m.sender,u.display,u.username,
              m.reply_to,m.forwarded_from,m.attachment_id,
              (SELECT a.mime FROM cloux_attachments a WHERE a.id=m.attachment_id) media_mime,
              (SELECT a.filename FROM cloux_attachments a WHERE a.id=m.attachment_id) media_filename,
              (SELECT substr(m2.text,1,140) FROM messages m2 WHERE m2.id=m.reply_to) reply_text,
              (SELECT u2.display FROM messages m2 JOIN users u2 ON u2.id=m2.sender WHERE m2.id=m.reply_to) reply_author
              FROM messages m
            JOIN users u ON u.id=m.sender WHERE m.chat_id=? AND m.id>? ORDER BY m.id ASC LIMIT 200""",
            (chat_id,max(after,0))).fetchall()
    with db() as c:
        result = []
        for x in rows:
            item=dict(x)
            item["badges"]=[b["badge_id"] for b in c.execute(
                "SELECT badge_id FROM user_badges WHERE user_id=?", (item["sender"],))]
            result.append(item)
    return {"messages":result}

@app.post("/api/chats/{chat_id}/messages")
def send(chat_id: str, payload: Message, request: Request):
    user=auth(request)
    limit(request,120)
    with db() as c:
        if not member(c,user["id"],chat_id): fail("Немає доступу.",403)
        if cloux_admin.moderation(c, user["id"])["muted_until"] > int(time.time()):
            fail("Надсилання повідомлень тимчасово обмежене.", 403)
        kind=c.execute("SELECT kind FROM chats WHERE id=?",(chat_id,)).fetchone()
        if kind and kind["kind"]=="news": fail("Офіційний канал тільки для читання.",403)
        if kind and kind["kind"]=="channel":
            owner=c.execute("SELECT owner_id FROM cloux_owners WHERE chat_id=?",(chat_id,)).fetchone()
            if not owner or owner["owner_id"]!=user["id"]: fail("Писати в канал може лише власник.",403)
        if not payload.text.strip(): fail("Порожнє повідомлення.")
        now=int(time.time())
        cursor=c.execute("INSERT INTO messages(chat_id,sender,text,created) VALUES(?,?,?,?)",
                       (chat_id,user["id"],payload.text.strip(),now))
        mid=cursor.lastrowid
    cloux_realtime.hub.emit(chat_id,"new_message",message_id=mid)
    return {"id":mid,"created":now}


# Optional Cloux features initialized after the base routes are registered.
import cloux_admin
cloux_admin.init(db)
import cloux_features
cloux_features.initialize(db,hash_password)
cloux_features.install(app,db,auth,fail,hash_password,check_password,member,limit)

import cloux_calls
cloux_calls.install(app,db)

from fastapi.responses import Response
from pathlib import Path as _ClouxPath

@app.get("/manifest.webmanifest")
def cloux_manifest():
    return FileResponse(_ClouxPath(__file__).parent/"manifest.webmanifest",media_type="application/manifest+json")

@app.get("/sw.js")
def cloux_sw():
    return FileResponse(_ClouxPath(__file__).parent/"sw.js",media_type="application/javascript",
        headers={"Service-Worker-Allowed":"/","Cache-Control":"no-cache"})

@app.get("/cloux-v2.js")
def cloux_frontend():
    return FileResponse(_ClouxPath(__file__).parent/"cloux-v2.js",media_type="application/javascript")

@app.get("/cloux-icon.svg")
def cloux_icon():
    return FileResponse(_ClouxPath(__file__).parent/"cloux-icon.svg",media_type="image/svg+xml")

from fastapi.responses import RedirectResponse

@app.get("/download")
def cloux_download_page():
    return FileResponse(_ClouxPath(__file__).parent/"download.html",media_type="text/html")

@app.get("/apk")
def cloux_apk_download():
    return RedirectResponse("https://raw.githubusercontent.com/grebenjuk13-source/cloux-messenger/main/downloads/Cloux-Android-debug.apk",status_code=302)

@app.get("/dmg")
def cloux_mac_download():
    return RedirectResponse("https://github.com/grebenjuk13-source/cloux-messenger/releases/download/cloux-macos/Cloux-macOS.dmg",status_code=302)

@app.get("/exe")
def cloux_windows_download():
    return RedirectResponse("https://github.com/grebenjuk13-source/cloux-messenger/releases/download/cloux-windows/Cloux.exe",status_code=302)

@app.get("/assets/cloux-official-{size}.jpg")
def cloux_official_icon(size: int):
    if size not in (192,512):
        fail("Невідомий розмір іконки.",404)
    return FileResponse(_ClouxPath(__file__).parent/"assets"/f"cloux-official-{size}.jpg",media_type="image/jpeg",headers={"Cache-Control":"public, max-age=3600"})

import cloux_messages
cloux_messages.init(db)
cloux_messages.install(app,db,auth,member,fail,limit)

@app.get("/cloux-v3.js")
def cloux_v3_script():
    return FileResponse(_ClouxPath(__file__).parent/"cloux-v3.js",media_type="application/javascript")

import cloux_media
cloux_media.init(db)
cloux_media.install(app,db,auth,member,fail,limit,DATA)

@app.get("/cloux-media.js")
def cloux_media_script():
    return FileResponse(_ClouxPath(__file__).parent/"cloux-media.js",media_type="application/javascript")

# Modular Cloux UI and social features.
import cloux_social
cloux_social.init(db)
cloux_social.install(app,db,auth,member,fail,limit,DATA,BASE)

@app.get("/modern")
def modern_ui():
    return FileResponse(BASE/"modern.html",media_type="text/html",headers={"Cache-Control":"no-store"})

@app.get("/ui/{filename}")
def modern_assets(filename:str):
    allowed={"styles.css":"text/css","core.js":"application/javascript",
             "emoji.js":"application/javascript","avatar.js":"application/javascript",
             "calls.js":"application/javascript","app.js":"application/javascript"}
    if filename not in allowed:fail("Файл не знайдено.",404)
    return FileResponse(BASE/"ui"/filename,media_type=allowed[filename])

# User interface preferences remain supported; old code and SMS verification routes are removed.
import cloux_preferences
cloux_preferences.install(app,db,auth,fail)

@app.get("/v5")
def stage1_redirect():
    from fastapi.responses import RedirectResponse
    return RedirectResponse("/v5/",status_code=308)

@app.get("/v5/{asset:path}")
def stage1_frontend(asset:str):
    root=(BASE/"frontend_dist").resolve()
    file=(root/(asset or "index.html")).resolve()
    if not file.is_relative_to(root) or not file.is_file():
        fail("Файл не знайдено.",404)
    from mimetypes import guess_type
    mime=guess_type(str(file))[0] or "application/octet-stream"
    return FileResponse(file,media_type=mime,headers={"Cache-Control":"no-cache" if file.name=="index.html" else "public,max-age=3600"})

# Single-instance real-time message and typing hub.
import cloux_realtime
cloux_realtime.install(app,db)

# Existing account login by email and Cloux password. Self-service signup is disabled.
import cloux_auth
cloux_auth.install(app,db,fail,limit,set_cookie)
cloux_admin.install(app,db,auth,fail,limit,check_password)


# Isolated, network-blocked, single-HTML local demo; existing online Cloux is unchanged.
@app.get("/offline")
@app.get("/offline/")
def offline_single_file_cloux():
    return FileResponse(BASE / "offline" / "index.html", media_type="text/html", headers={
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
    })
