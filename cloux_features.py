"""Cloux user features: saved messages, official news, profile, preferences and channels."""
import re
import secrets
import sqlite3
import time
import uuid
from fastapi import Request
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel, Field

NEWS="cloux-official-news"
SYSTEM="cloux-system"
DEFAULTS={"accent":"#E11D2E","wallpaper":"default","font_size":15,"compact":False,"notify":True,"searchable":True,"avatar":"💬","bio":""}

def initialize(db, hash_password):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS cloux_preferences(
          uid TEXT PRIMARY KEY REFERENCES users(id),
          accent TEXT NOT NULL DEFAULT '#E11D2E',
          wallpaper TEXT NOT NULL DEFAULT 'default',
          font_size INTEGER NOT NULL DEFAULT 15,
          compact INTEGER NOT NULL DEFAULT 0,
          notify INTEGER NOT NULL DEFAULT 1,
          searchable INTEGER NOT NULL DEFAULT 1,
          avatar TEXT NOT NULL DEFAULT '💬',
          bio TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS cloux_chat_prefs(
          uid TEXT NOT NULL REFERENCES users(id), chat_id TEXT NOT NULL REFERENCES chats(id),
          pinned INTEGER NOT NULL DEFAULT 0,
          archived INTEGER NOT NULL DEFAULT 0,
          muted INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(uid,chat_id));
        CREATE TABLE IF NOT EXISTS cloux_owners(
          chat_id TEXT PRIMARY KEY REFERENCES chats(id),
          owner_id TEXT NOT NULL REFERENCES users(id));
        """)
        c.execute("INSERT OR IGNORE INTO users(id,phone,username,display,password_hash,created) VALUES(?,?,?,?,?,?)",
                  (SYSTEM,"+99900000000001","cloux_official","Cloux",hash_password(secrets.token_urlsafe(36)),int(time.time())))
        c.execute("INSERT OR IGNORE INTO chats(id,title,kind,created) VALUES(?,?,?,?)",
                  (NEWS,"Новини Cloux","news",int(time.time())))
        if not c.execute("SELECT 1 FROM messages WHERE chat_id=?",(NEWS,)).fetchone():
            c.execute("INSERT INTO messages(chat_id,sender,text,created) VALUES(?,?,?,?)",
                      (NEWS,SYSTEM,"❤️ Вітаємо в Cloux!\nТут будуть офіційні новини, нові можливості та важливі оголошення. Бережіть приватність: поточний сервер працює без постійного сховища.",int(time.time())))

def seed_user(db, uid):
    """Idempotent: create personal notes and subscribe user to the official news."""
    with db() as c:
        if not c.execute("SELECT 1 FROM users WHERE id=?",(uid,)).fetchone(): return
        cid="cloux-saved-"+uid
        c.execute("INSERT OR IGNORE INTO chats(id,title,kind,created) VALUES(?,?,?,?)",
                  (cid,"Нотатки","saved",int(time.time())+100))
        c.execute("INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)",(cid,uid))
        c.execute("INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)",(NEWS,uid))
        c.execute("INSERT OR IGNORE INTO cloux_preferences(uid) VALUES(?)",(uid,))
        if not c.execute("SELECT 1 FROM messages WHERE chat_id=?",(cid,)).fetchone():
            c.execute("INSERT INTO messages(chat_id,sender,text,created) VALUES(?,?,?,?)",
                      (cid,uid,"📝 Це твої особисті нотатки. Сюди можна зберігати думки, нагадування та повідомлення.",int(time.time())))

class PrefUpdate(BaseModel):
    accent: str | None = None
    wallpaper: str | None = None
    font_size: int | None = None
    compact: bool | None = None
    notify: bool | None = None
    searchable: bool | None = None
    avatar: str | None = None

class ProfileUpdate(BaseModel):
    display: str = Field(min_length=1,max_length=60)
    username: str = Field(min_length=4,max_length=24)
    bio: str = Field(default="",max_length=180)

class ChatPrefs(BaseModel):
    pinned: bool | None = None
    archived: bool | None = None
    muted: bool | None = None

class ChannelPayload(BaseModel):
    title: str = Field(min_length=2,max_length=65)

class EditedMessage(BaseModel):
    text: str = Field(min_length=1,max_length=4000)

class PasswordUpdate(BaseModel):
    old: str
    new: str

def install(app, db, auth, fail, hash_password, check_password, member, limit):
    @app.get("/cloux-plus.js")
    def asset_js():
        return FileResponse(__import__("pathlib").Path(__file__).parent/"cloux-plus.js", media_type="application/javascript")

    @app.get("/api/preferences")
    def get_prefs(request: Request):
        me=auth(request)
        seed_user(db,me["id"])
        with db() as c:
            row=c.execute("SELECT * FROM cloux_preferences WHERE uid=?",(me["id"],)).fetchone()
        return {"preferences":dict(row)}

    @app.patch("/api/preferences")
    def save_prefs(data: PrefUpdate, request: Request):
        me=auth(request)
        seed_user(db,me["id"])
        changes=data.model_dump(exclude_none=True)
        if "accent" in changes and changes["accent"] not in ("#E11D2E","#E84E61","#BC193A","#F04438"):
            fail("Непідтримуваний колір.")
        if "wallpaper" in changes and changes["wallpaper"] not in ("default","plain","dots","gradient"):
            fail("Непідтримуваний фон.")
        if "font_size" in changes and not 13<=changes["font_size"]<=21:
            fail("Розмір тексту 13–21.")
        if "avatar" in changes and not 1<=len(changes["avatar"])<=10:
            fail("Некоректний аватар.")
        for key in ("compact","notify","searchable"):
            if key in changes: changes[key]=int(changes[key])
        with db() as c:
            if changes:
                c.execute("UPDATE cloux_preferences SET "+",".join(k+"=?" for k in changes)+" WHERE uid=?",
                    (*changes.values(),me["id"]))
        return get_prefs(request)

    @app.get("/api/profile")
    def profile(request: Request):
        me=auth(request)
        seed_user(db,me["id"])
        with db() as c:
            x=c.execute("SELECT display,username,created FROM users WHERE id=?",(me["id"],)).fetchone()
            p=c.execute("SELECT bio,avatar FROM cloux_preferences WHERE uid=?",(me["id"],)).fetchone()
        return {"profile":{**dict(x),**dict(p)}}

    @app.patch("/api/profile")
    def edit_profile(data: ProfileUpdate, request: Request):
        me=auth(request)
        username=data.username.strip().lower()
        display=data.display.strip()
        if not re.fullmatch(r"[a-z0-9_]{4,24}",username):fail("Позивний: 4–24 латинські символи, цифри або _.")
        if not display:fail("Ім'я обов'язкове.")
        seed_user(db,me["id"])
        try:
            with db() as c:
                c.execute("UPDATE users SET display=?, username=? WHERE id=?",(display,username,me["id"]))
                c.execute("UPDATE cloux_preferences SET bio=? WHERE uid=?",(data.bio.strip(),me["id"]))
        except sqlite3.IntegrityError: fail("Такий позивний уже зайнятий.",409)
        return profile(request)

    @app.post("/api/password")
    def password(data: PasswordUpdate, request: Request):
        me=auth(request)
        if not 8<=len(data.new)<=128:fail("Пароль має містити 8–128 символів.")
        with db() as c:
            u=c.execute("SELECT password_hash FROM users WHERE id=?",(me["id"],)).fetchone()
            if not check_password(data.old,u["password_hash"]):fail("Старий пароль неправильний.",403)
            c.execute("UPDATE users SET password_hash=? WHERE id=?",(hash_password(data.new),me["id"]))
            token=request.cookies.get("cloux_session","")
            c.execute("DELETE FROM sessions WHERE uid=? AND token!=?",(me["id"],__import__("hashlib").sha256(token.encode()).hexdigest()))
        return {"ok":True}

    @app.get("/api/devices")
    def devices(request: Request):
        me=auth(request)
        with db() as c:
            total=c.execute("SELECT count(*) n FROM sessions WHERE uid=? AND expires>?",(me["id"],int(time.time()))).fetchone()["n"]
        return {"sessions":total}

    @app.post("/api/devices/revoke-others")
    def revoke(request: Request):
        me=auth(request)
        token=request.cookies.get("cloux_session","")
        with db() as c:
            c.execute("DELETE FROM sessions WHERE uid=? AND token!=?",(me["id"],__import__("hashlib").sha256(token.encode()).hexdigest()))
        return {"ok":True}

    @app.post("/api/chats/{cid}/preferences")
    def chat_preferences(cid: str, data: ChatPrefs, request: Request):
        me=auth(request)
        with db() as c:
            if not member(c,me["id"],cid):fail("Немає доступу.",403)
            c.execute("INSERT OR IGNORE INTO cloux_chat_prefs(uid,chat_id) VALUES(?,?)",(me["id"],cid))
            d=data.model_dump(exclude_none=True)
            if d:
                c.execute("UPDATE cloux_chat_prefs SET "+",".join(k+"=?" for k in d)+" WHERE uid=? AND chat_id=?",
                          (*(int(v) for v in d.values()),me["id"],cid))
        return {"ok":True}

    @app.post("/api/channels")
    def channel(data: ChannelPayload, request: Request):
        me=auth(request)
        limit(request,20)
        cid=str(uuid.uuid4())
        with db() as c:
            c.execute("INSERT INTO chats(id,title,kind,created) VALUES(?,?,?,?)",
                      (cid,data.title.strip(),"channel",int(time.time())))
            c.execute("INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)",(cid,me["id"]))
            c.execute("INSERT INTO cloux_owners(chat_id,owner_id) VALUES(?,?)",(cid,me["id"]))
        return {"chat_id":cid}

    @app.patch("/api/messages/{mid}")
    def edit_message(mid: int, data: EditedMessage, request: Request):
        me=auth(request)
        with db() as c:
            m=c.execute("SELECT sender,chat_id FROM messages WHERE id=?",(mid,)).fetchone()
            if not m:fail("Повідомлення не знайдено.",404)
            if m["sender"]!=me["id"] or not member(c,me["id"],m["chat_id"]):fail("Можна редагувати тільки свої повідомлення.",403)
            if m["chat_id"]==NEWS:fail("Офіційні новини не редагуються.",403)
            c.execute("UPDATE messages SET text=? WHERE id=?",(data.text.strip(),mid))
        return {"ok":True}

    @app.delete("/api/messages/{mid}")
    def delete_message(mid: int, request: Request):
        me=auth(request)
        with db() as c:
            m=c.execute("SELECT sender,chat_id FROM messages WHERE id=?",(mid,)).fetchone()
            if not m:fail("Повідомлення не знайдено.",404)
            if m["sender"]!=me["id"] or not member(c,me["id"],m["chat_id"]):fail("Можна видаляти тільки свої повідомлення.",403)
            if m["chat_id"]==NEWS:fail("Офіційні новини не видаляються.",403)
            c.execute("DELETE FROM messages WHERE id=?",(mid,))
        return {"ok":True}
