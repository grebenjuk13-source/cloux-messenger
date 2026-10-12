"""Cloux private administration. All permissions are checked on the server."""
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import time
from email.message import EmailMessage

from fastapi import Request
from pydantic import BaseModel, Field

NEWS = "cloux-official-news"
SYSTEM = "cloux-system"
COLORS = {"accent": "#C8102E", "background": "#0A0A0C",
          "surface": "#16161A", "bubble": "#A5122B", "text": "#FFFFFF",
          "name": "Cloux.", "icon": "default", "wallpaper": "doodles", "radius": 18,
          "font": "system"}
FEATURES = {"registration": True, "calls": True, "groups": True, "channels": True,
            "stickers": True, "reactions": True, "maintenance": False}
BADGES = [
    ("verified", "Верифікований", "check-circle", "#FF6B7A", "Підтверджений акаунт"),
    ("youtube", "YouTuber", "play", "#FF3B52", "Автор відео"),
    ("premium", "Преміум", "gem", "#E4B9FF", "Преміум-профіль"),
    ("official", "Офіційний", "shield-check", "#FF6B7A", "Офіційний акаунт"),
    ("vip", "VIP", "star", "#FFB86B", "Особливий учасник"),
]


def owner_email():
    return os.getenv("OWNER_EMAIL", "").strip().lower()


def init(db):
    with db() as c:
        columns = {r["name"] for r in c.execute("PRAGMA table_info(users)")}
        if "email_verified" not in columns:
            c.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0")
        c.executescript("""
        CREATE TABLE IF NOT EXISTS roles(
            user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            role TEXT NOT NULL CHECK(role IN ('owner','admin','moderator','user')),
            granted_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS badges(
            id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL,
            color TEXT NOT NULL, description TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS user_badges(
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            badge_id TEXT NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
            granted_at INTEGER NOT NULL,
            PRIMARY KEY(user_id,badge_id));
        CREATE TABLE IF NOT EXISTS theme(
            id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL,
            updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS feature_flags(
            name TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS audit_log(
            id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL,
            action TEXT NOT NULL, target TEXT, detail TEXT NOT NULL DEFAULT '{}',
            created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS owner_email_challenges(
            uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            code_hash TEXT NOT NULL, expires INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS user_moderation(
            uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            blocked INTEGER NOT NULL DEFAULT 0, muted_until INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS owner_totp(
            uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            secret TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS cloux_admin_chat_meta(
            chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
            description TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '',
            pinned_message_id INTEGER);
        CREATE TABLE IF NOT EXISTS cloux_admin_reports(
            id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id TEXT NOT NULL,
            subject_id TEXT NOT NULL, category TEXT NOT NULL, reason TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open', created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS owner_totp_sessions(
            session_hash TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            expires INTEGER NOT NULL);
        """)
        for badge in BADGES:
            c.execute("INSERT OR IGNORE INTO badges(id,name,icon,color,description) VALUES(?,?,?,?,?)", badge)
        c.execute("INSERT OR IGNORE INTO theme(id,config,updated_at) VALUES(1,?,?)",
                  (json.dumps(COLORS), int(time.time())))
        for key, value in FEATURES.items():
            c.execute("INSERT OR IGNORE INTO feature_flags(name,enabled) VALUES(?,?)", (key, int(value)))


def is_owner(c, uid):
    email = owner_email()
    if not email:
        return False
    return bool(c.execute("""
        SELECT 1 FROM users u JOIN roles r ON r.user_id=u.id
        WHERE u.id=? AND lower(u.email)=? AND u.email_verified=1 AND r.role='owner'
        """, (uid, email)).fetchone())


def candidate(c, uid):
    email = owner_email()
    if not email:
        return False
    return bool(c.execute("SELECT 1 FROM users WHERE id=? AND lower(email)=?",
                          (uid, email)).fetchone())


def audit(c, uid, action, target="", detail=None):
    c.execute("INSERT INTO audit_log(actor_id,action,target,detail,created) VALUES(?,?,?,?,?)",
              (uid, action, str(target), json.dumps(detail or {}, ensure_ascii=False), int(time.time())))


def moderation(c, uid):
    row = c.execute("SELECT blocked,muted_until FROM user_moderation WHERE uid=?", (uid,)).fetchone()
    return dict(row) if row else {"blocked": 0, "muted_until": 0}


def flag(c, key):
    row = c.execute("SELECT enabled FROM feature_flags WHERE name=?", (key,)).fetchone()
    return bool(row["enabled"]) if row else FEATURES.get(key, False)


def totp_cipher():
    from cryptography.fernet import Fernet
    key=os.getenv("CLOUX_TOTP_FERNET_KEY","").strip()
    if not key:
        raise RuntimeError("CLOUX_TOTP_FERNET_KEY must be set for TOTP")
    return Fernet(key.encode("ascii"))

def encrypted_totp(secret):
    return totp_cipher().encrypt(secret.encode("ascii")).decode("ascii")

def decrypted_totp(secret):
    # Migrates any initial development-only plaintext values.
    return totp_cipher().decrypt(secret.encode("ascii")).decode("ascii") if secret.startswith("gAAAA") else secret

def send_code(address, code):
    host = os.getenv("SMTP_HOST", "").strip()
    username = os.getenv("SMTP_USER", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    sender = os.getenv("SMTP_FROM", "").strip()
    if not all((host, username, password, sender)):
        raise RuntimeError("SMTP не налаштовано")
    msg = EmailMessage()
    msg["Subject"] = "Cloux — підтвердження електронної пошти"
    msg["From"] = sender
    msg["To"] = address
    msg.set_content("Код підтвердження Cloux: " + code +
                    "\nДійсний 10 хвилин. Нікому не передавайте цей код.")
    port = int(os.getenv("SMTP_PORT", "587"))
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=12) as s:
            s.login(username, password)
            s.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=12) as s:
            s.starttls()
            s.login(username, password)
            s.send_message(msg)


class Verification(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


class BadgeCreate(BaseModel):
    id: str = Field(min_length=3, max_length=40, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=2, max_length=40)
    icon: str = Field(min_length=1, max_length=40)
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    description: str = Field(default="", max_length=160)


class BadgeToggle(BaseModel):
    enabled: bool


class ThemeUpdate(BaseModel):
    name: str = Field(default="Cloux.", min_length=2, max_length=32)
    icon: str = Field(default="default", pattern=r"^(default|official)$")
    wallpaper: str = Field(default="doodles", pattern=r"^(doodles|plain|stars)$")
    radius: int = Field(default=18, ge=4, le=32)
    font: str = Field(default="system", pattern=r"^(system|rounded|mono)$")
    accent: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    background: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    surface: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    bubble: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    text: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")


class FlagToggle(BaseModel):
    enabled: bool


class UserEdit(BaseModel):
    display: str | None = Field(default=None, min_length=1, max_length=48)
    username: str | None = Field(default=None, min_length=3, max_length=32)
    bio: str | None = Field(default=None, max_length=180)
    blocked: bool | None = None
    muted_minutes: int | None = Field(default=None, ge=0, le=525600)


class RoleUpdate(BaseModel):
    role: str = Field(pattern=r"^(user|moderator|admin)$")

class ChatCreate(BaseModel):
    title: str = Field(min_length=2, max_length=65)
    kind: str = Field(default="channel", pattern=r"^(channel|group)$")
    description: str = Field(default="", max_length=500)

class ChatUpdate(BaseModel):
    title: str = Field(min_length=2, max_length=65)
    description: str = Field(default="", max_length=500)

class ReportCreate(BaseModel):
    subject_id: str = Field(min_length=1, max_length=120)
    category: str = Field(pattern=r"^(user|group|channel|direct)$")
    reason: str = Field(min_length=10, max_length=500)

class ReportUpdate(BaseModel):
    status: str = Field(pattern=r"^(open|reviewing|resolved|dismissed)$")

class Announcement(BaseModel):
    text: str = Field(min_length=2, max_length=4000)


class TotpStart(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class TotpCode(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


def install(app, db, auth, fail, limit, check_password, emit=None):
    def require_owner(request, totp=False):
        user = auth(request)
        with db() as c:
            if not is_owner(c, user["id"]):
                fail("Немає доступу.", 403)
            row = c.execute("SELECT enabled FROM owner_totp WHERE uid=?", (user["id"],)).fetchone()
            if totp and row and row["enabled"]:
                token = request.cookies.get("cloux_session", "")
                digest = hashlib.sha256(token.encode()).hexdigest()
                unlocked = c.execute("""
                    SELECT 1 FROM owner_totp_sessions WHERE session_hash=? AND uid=? AND expires>?
                    """, (digest, user["id"], int(time.time()))).fetchone()
                if not unlocked:
                    fail("Потрібен код двофакторного захисту.", 428)
        return user

    @app.get("/api/public/config")
    def public_config():
        with db() as c:
            return {
                "theme": json.loads(c.execute("SELECT config FROM theme WHERE id=1").fetchone()["config"]),
                "features": {r["name"]: bool(r["enabled"]) for r in c.execute(
                    "SELECT name,enabled FROM feature_flags")},
            }

    @app.post("/api/account/verify-email/send")
    def verify_send(request: Request):
        user = auth(request)
        limit(request, 3, 3600)
        with db() as c:
            row = c.execute("SELECT email FROM users WHERE id=?", (user["id"],)).fetchone()
            if not candidate(c, user["id"]) or not row["email"]:
                fail("Підтвердження недоступне для цього акаунта.", 403)
            if is_owner(c, user["id"]):
                return {"ok": True}
            code = f"{secrets.randbelow(1000000):06d}"
            try:
                send_code(row["email"], code)
            except Exception:
                fail("Неможливо надіслати лист. Перевірте налаштування пошти.", 503)
            c.execute("""INSERT INTO owner_email_challenges(uid,code_hash,expires,attempts)
                VALUES(?,?,?,0) ON CONFLICT(uid) DO UPDATE SET
                code_hash=excluded.code_hash,expires=excluded.expires,attempts=0""",
                (user["id"], hashlib.sha256(code.encode()).hexdigest(), int(time.time())+600))
        return {"ok": True}

    @app.post("/api/account/verify-email/confirm")
    def verify_confirm(body: Verification, request: Request):
        user = auth(request)
        limit(request, 8, 3600)
        with db() as c:
            if not candidate(c, user["id"]):
                fail("Немає доступу.", 403)
            challenge = c.execute("SELECT * FROM owner_email_challenges WHERE uid=?",
                                  (user["id"],)).fetchone()
            if not challenge or challenge["expires"] < int(time.time()) or challenge["attempts"] >= 5:
                fail("Код недійсний або термін дії минув.", 400)
            c.execute("UPDATE owner_email_challenges SET attempts=attempts+1 WHERE uid=?",
                      (user["id"],))
            if not hmac.compare_digest(challenge["code_hash"], hashlib.sha256(
                    body.code.encode()).hexdigest()):
                fail("Код неправильний.", 400)
            c.execute("UPDATE users SET email_verified=1 WHERE id=?", (user["id"],))
            c.execute("""INSERT INTO roles(user_id,role,granted_at) VALUES(?,'owner',?)
                ON CONFLICT(user_id) DO UPDATE SET role='owner',granted_at=excluded.granted_at""",
                (user["id"], int(time.time())))
            c.execute("DELETE FROM owner_email_challenges WHERE uid=?", (user["id"],))
            audit(c, user["id"], "owner.email_verified")
        return {"ok": True}

    @app.get("/api/admin/overview")
    def overview(request: Request):
        require_owner(request)
        with db() as c:
            return {
                "users": c.execute("SELECT COUNT(*) n FROM users WHERE id!=?", (SYSTEM,)).fetchone()["n"],
                "chats": c.execute("SELECT COUNT(*) n FROM chats WHERE kind NOT IN ('direct','saved')").fetchone()["n"],
                "messages": c.execute("""SELECT COUNT(*) n FROM messages m JOIN chats ch
                    ON ch.id=m.chat_id WHERE ch.kind NOT IN ('direct','saved')""").fetchone()["n"],
                "badges": [dict(r) for r in c.execute("SELECT * FROM badges ORDER BY id")],
                "theme": json.loads(c.execute("SELECT config FROM theme WHERE id=1").fetchone()["config"]),
                "features": {r["name"]: bool(r["enabled"]) for r in c.execute(
                    "SELECT * FROM feature_flags")},
            }

    @app.get("/api/admin/users")
    def admin_users(request: Request, q: str = ""):
        require_owner(request)
        query = "%" + q[:70].strip() + "%"
        with db() as c:
            rows = c.execute("""SELECT u.id,u.display,u.username,u.email,u.email_verified,
                COALESCE(m.blocked,0) blocked,COALESCE(m.muted_until,0) muted_until
                FROM users u LEFT JOIN user_moderation m ON m.uid=u.id
                WHERE u.id!=? AND (u.display LIKE ? OR u.username LIKE ? OR u.email LIKE ?)
                ORDER BY u.created DESC LIMIT 75""", (SYSTEM, query, query, query)).fetchall()
            out = []
            for r in rows:
                d = dict(r)
                d["role"] = (c.execute("SELECT role FROM roles WHERE user_id=?",(r["id"],)).fetchone() or {"role":"user"})["role"]
                d["badges"] = [x["badge_id"] for x in c.execute(
                    "SELECT badge_id FROM user_badges WHERE user_id=?", (r["id"],))]
                out.append(d)
        return {"users": out}

    @app.post("/api/admin/badges")
    def create_badge(body: BadgeCreate, request: Request):
        me = require_owner(request, True)
        with db() as c:
            if c.execute("SELECT 1 FROM badges WHERE id=?", (body.id,)).fetchone():
                fail("Значок уже існує.")
            c.execute("INSERT INTO badges(id,name,icon,color,description) VALUES(?,?,?,?,?)",
                      (body.id, body.name, body.icon, body.color, body.description))
            audit(c, me["id"], "badge.create", body.id)
        return {"ok": True}

    @app.put("/api/admin/users/{uid}/badges/{badge_id}")
    def toggle_badge(uid: str, badge_id: str, body: BadgeToggle, request: Request):
        me = require_owner(request, True)
        with db() as c:
            if is_owner(c, uid) and uid!=me["id"]:
                fail("Значки власника захищені.", 403)
            if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                fail("Користувача не знайдено.", 404)
            if not c.execute("SELECT 1 FROM badges WHERE id=?", (badge_id,)).fetchone():
                fail("Значка не існує.", 404)
            if body.enabled:
                c.execute("INSERT OR IGNORE INTO user_badges(user_id,badge_id,granted_at) VALUES(?,?,?)",
                          (uid, badge_id, int(time.time())))
            else:
                c.execute("DELETE FROM user_badges WHERE user_id=? AND badge_id=?", (uid, badge_id))
            audit(c, me["id"], "badge.toggle", uid, {"badge": badge_id, "enabled": body.enabled})
        return {"ok": True}

    @app.patch("/api/admin/users/{uid}")
    def edit_user(uid: str, body: UserEdit, request: Request):
        me = require_owner(request, True)
        if uid == SYSTEM:
            fail("Системний акаунт захищено.", 403)
        with db() as c:
            if is_owner(c, uid) and uid != me["id"]:
                fail("Акаунт власника захищено.", 403)
            if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                fail("Користувача не знайдено.", 404)
            if body.display is not None:
                c.execute("UPDATE users SET display=? WHERE id=?", (body.display.strip(), uid))
            if body.username is not None:
                nickname = body.username.strip().lstrip("@").lower()
                if not re.fullmatch(r"[a-z0-9_]{3,32}", nickname):
                    fail("Некоректний нікнейм.")
                if c.execute("SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id!=?",
                             (nickname, uid)).fetchone():
                    fail("Нікнейм зайнятий.")
                c.execute("UPDATE users SET username=? WHERE id=?", (nickname, uid))
            if body.bio is not None:
                c.execute("INSERT OR IGNORE INTO cloux_preferences(uid) VALUES(?)", (uid,))
                c.execute("UPDATE cloux_preferences SET bio=? WHERE uid=?", (body.bio, uid))
            if body.blocked is not None or body.muted_minutes is not None:
                if is_owner(c, uid):
                    fail("Не можна блокувати або вимикати звук власнику.", 403)
                c.execute("INSERT OR IGNORE INTO user_moderation(uid) VALUES(?)", (uid,))
                if body.blocked is not None:
                    c.execute("UPDATE user_moderation SET blocked=? WHERE uid=?",
                              (int(body.blocked), uid))
                    if body.blocked:
                        c.execute("DELETE FROM sessions WHERE uid=?", (uid,))
                if body.muted_minutes is not None:
                    until = int(time.time()) + body.muted_minutes*60 if body.muted_minutes else 0
                    c.execute("UPDATE user_moderation SET muted_until=? WHERE uid=?", (until, uid))
            audit(c, me["id"], "user.edit", uid, body.model_dump(exclude_none=True))
        return {"ok": True}

    @app.post("/api/admin/users/{uid}/logout-all")
    def terminate_sessions(uid: str, request: Request):
        me = require_owner(request, True)
        with db() as c:
            if is_owner(c, uid):
                fail("Сесії власника захищено.", 403)
            c.execute("DELETE FROM sessions WHERE uid=?", (uid,))
            audit(c, me["id"], "sessions.revoke", uid)
        return {"ok": True}

    @app.put("/api/admin/theme")
    def update_theme(body: ThemeUpdate, request: Request):
        me = require_owner(request, True)
        def luminance(color):
            components=[int(color[i:i+2],16)/255 for i in (1,3,5)]
            components=[v/12.92 if v<=0.04045 else ((v+0.055)/1.055)**2.4 for v in components]
            return 0.2126*components[0]+0.7152*components[1]+0.0722*components[2]
        text_light=luminance(body.text)
        for layer in (body.background,body.surface,body.bubble):
            back_light=luminance(layer)
            contrast=(max(text_light,back_light)+0.05)/(min(text_light,back_light)+0.05)
            if contrast<4.5:
                fail("Замалий контраст тексту: потрібно не менше 4.5:1.",422)
        with db() as c:
            c.execute("UPDATE theme SET config=?,updated_at=? WHERE id=1",
                      (body.model_dump_json(), int(time.time())))
            audit(c, me["id"], "theme.update", detail=body.model_dump())
        return {"ok": True}

    @app.put("/api/admin/features/{name}")
    def update_feature(name: str, body: FlagToggle, request: Request):
        me = require_owner(request, True)
        if name not in FEATURES:
            fail("Невідома функція.", 404)
        with db() as c:
            c.execute("UPDATE feature_flags SET enabled=? WHERE name=?", (int(body.enabled), name))
            audit(c, me["id"], "feature.toggle", name, {"enabled": body.enabled})
        return {"ok": True}

    @app.post("/api/admin/announcements")
    def announcement(body: Announcement, request: Request):
        me = require_owner(request, True)
        with db() as c:
            c.execute("INSERT INTO messages(chat_id,sender,text,created) VALUES(?,?,?,?)",
                      (NEWS, SYSTEM, body.text.strip(), int(time.time())))
            audit(c, me["id"], "announcement.publish", NEWS, {"length": len(body.text)})
        return {"ok": True}

    @app.put("/api/admin/users/{uid}/role")
    def set_role(uid: str, body: RoleUpdate, request: Request):
        me=require_owner(request, True)
        with db() as c:
            if is_owner(c,uid) or uid==SYSTEM:
                fail("Роль власника й системний акаунт захищено.", 403)
            if not c.execute("SELECT 1 FROM users WHERE id=?", (uid,)).fetchone():
                fail("Користувача не знайдено.", 404)
            c.execute("""INSERT INTO roles(user_id,role,granted_at) VALUES(?,?,?)
                ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,granted_at=excluded.granted_at""",
                (uid, body.role, int(time.time())))
            audit(c, me["id"], "role.update", uid, {"role":body.role})
        return {"ok":True}

    @app.post("/api/admin/chats")
    def create_public_chat(body: ChatCreate, request: Request):
        me=require_owner(request, True)
        import uuid
        chat_id=str(uuid.uuid4())
        with db() as c:
            now=int(time.time())
            c.execute("INSERT INTO chats(id,title,kind,created) VALUES(?,?,?,?)",
                      (chat_id,body.title.strip(),body.kind,now))
            c.execute("INSERT INTO cloux_owners(chat_id,owner_id) VALUES(?,?)",(chat_id,me["id"]))
            c.execute("INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)",(chat_id,me["id"]))
            c.execute("INSERT INTO cloux_admin_chat_meta(chat_id,description) VALUES(?,?)",
                      (chat_id,body.description))
            audit(c,me["id"],"chat.create",chat_id,{"kind":body.kind})
        return {"ok":True,"chat_id":chat_id}

    @app.patch("/api/admin/chats/{cid}")
    def edit_public_chat(cid: str, body: ChatUpdate, request: Request):
        me=require_owner(request, True)
        with db() as c:
            row=c.execute("SELECT kind FROM chats WHERE id=?",(cid,)).fetchone()
            if not row or row["kind"] in ("direct","saved"):
                fail("Особисті чати недоступні для адміністрування.",403)
            c.execute("UPDATE chats SET title=? WHERE id=?",(body.title.strip(),cid))
            c.execute("""INSERT INTO cloux_admin_chat_meta(chat_id,description) VALUES(?,?)
                ON CONFLICT(chat_id) DO UPDATE SET description=excluded.description""",
                (cid,body.description))
            audit(c,me["id"],"chat.edit",cid)
        return {"ok":True}

    @app.delete("/api/admin/chats/{cid}/messages/{mid}")
    def delete_public_message(cid: str, mid: int, request: Request):
        me=require_owner(request, True)
        with db() as c:
            row=c.execute("SELECT kind FROM chats WHERE id=?",(cid,)).fetchone()
            if not row or row["kind"] in ("direct","saved"):
                fail("Приватні повідомлення заборонено переглядати або змінювати.",403)
            exists=c.execute("SELECT 1 FROM messages WHERE id=? AND chat_id=?",(mid,cid)).fetchone()
            if not exists:fail("Повідомлення не знайдено.",404)
            c.execute("UPDATE messages SET text='[Видалено адміністрацією]' WHERE id=? AND chat_id=?",(mid,cid))
            audit(c,me["id"],"message.moderate",str(mid),{"chat":cid})
        return {"ok":True}

    @app.put("/api/admin/chats/{cid}/pin/{mid}")
    def pin_public_message(cid: str, mid: int, request: Request):
        me=require_owner(request, True)
        with db() as c:
            row=c.execute("SELECT kind FROM chats WHERE id=?",(cid,)).fetchone()
            if not row or row["kind"] in ("direct","saved"):
                fail("Приватні повідомлення недоступні.",403)
            if not c.execute("SELECT 1 FROM messages WHERE chat_id=? AND id=?",(cid,mid)).fetchone():
                fail("Повідомлення не знайдено.",404)
            c.execute("""INSERT INTO cloux_admin_chat_meta(chat_id,pinned_message_id) VALUES(?,?)
                 ON CONFLICT(chat_id) DO UPDATE SET pinned_message_id=excluded.pinned_message_id""",(cid,mid))
            audit(c,me["id"],"message.pin",str(mid),{"chat":cid})
        return {"ok":True}

    @app.post("/api/reports")
    def create_report(body: ReportCreate, request: Request):
        me=auth(request)
        limit(request,5,3600)
        with db() as c:
            if body.category=="direct":
                chat=c.execute("SELECT kind FROM chats WHERE id=?",(body.subject_id,)).fetchone()
                if not chat or chat["kind"]!="direct":
                    fail("Приватний чат не знайдено.",404)
                if not c.execute("SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?",
                                 (body.subject_id,me["id"])).fetchone():
                    fail("Можна скаржитися лише на власні діалоги.",403)
                # Do not retain a direct-chat reason that might contain private content.
                reason="[Скарга на особистий чат, без тексту повідомлень]"
            else:
                reason=body.reason
            c.execute("""INSERT INTO cloux_admin_reports(
                reporter_id,subject_id,category,reason,created) VALUES(?,?,?,?,?)""",
                (me["id"],body.subject_id,body.category,reason,int(time.time())))
        return {"ok":True}

    @app.get("/api/admin/reports")
    def admin_reports(request: Request):
        require_owner(request)
        with db() as c:
            rows=c.execute("""SELECT id,subject_id,category,reason,status,created
                FROM cloux_admin_reports ORDER BY id DESC LIMIT 100""").fetchall()
        return {"reports":[dict(x) for x in rows]}

    @app.put("/api/admin/reports/{rid}")
    def update_report(rid: int, body: ReportUpdate, request: Request):
        me=require_owner(request,True)
        with db() as c:
            if not c.execute("SELECT 1 FROM cloux_admin_reports WHERE id=?",(rid,)).fetchone():
                fail("Скаргу не знайдено.",404)
            c.execute("UPDATE cloux_admin_reports SET status=? WHERE id=?",(body.status,rid))
            audit(c,me["id"],"report.update",str(rid),{"status":body.status})
        return {"ok":True}

    @app.get("/api/admin/chats")
    def admin_chats(request: Request):
        require_owner(request)
        with db() as c:
            rows = c.execute("""SELECT ch.id,ch.title,ch.kind,ch.created,
                COALESCE(meta.description,'') description,meta.pinned_message_id
                FROM chats ch LEFT JOIN cloux_admin_chat_meta meta ON meta.chat_id=ch.id
                WHERE ch.kind NOT IN ('direct','saved') ORDER BY ch.created DESC LIMIT 150""").fetchall()
        return {"chats": [dict(x) for x in rows]}

    @app.get("/api/admin/audit")
    def admin_audit(request: Request):
        require_owner(request)
        with db() as c:
            rows = c.execute("SELECT id,action,target,detail,created FROM audit_log ORDER BY id DESC LIMIT 150").fetchall()
        return {"logs": [dict(x) for x in rows]}

    @app.post("/api/admin/totp/start")
    def totp_start(body: TotpStart, request: Request):
        me = require_owner(request)
        import pyotp
        with db() as c:
            row = c.execute("SELECT password_hash,email FROM users WHERE id=?", (me["id"],)).fetchone()
            if not check_password(body.password, row["password_hash"]):
                fail("Пароль неправильний.", 401)
            if c.execute("SELECT 1 FROM owner_totp WHERE uid=? AND enabled=1",
                         (me["id"],)).fetchone():
                fail("Двофакторний захист вже увімкнено.")
            secret = pyotp.random_base32()
            try: stored_secret=encrypted_totp(secret)
            except Exception: fail("Не налаштовано захищене сховище TOTP.",503)
            c.execute("""INSERT INTO owner_totp(uid,secret,enabled) VALUES(?,?,0)
                ON CONFLICT(uid) DO UPDATE SET secret=excluded.secret,enabled=0""",
                (me["id"], stored_secret))
        return {"secret": secret, "uri": pyotp.totp.TOTP(secret).provisioning_uri(
            name=row["email"], issuer_name="Cloux")}

    @app.post("/api/admin/totp/enable")
    def totp_enable(body: TotpCode, request: Request):
        me = require_owner(request)
        import pyotp
        with db() as c:
            row = c.execute("SELECT secret FROM owner_totp WHERE uid=? AND enabled=0",
                            (me["id"],)).fetchone()
            if not row or not pyotp.TOTP(decrypted_totp(row["secret"])).verify(body.code, valid_window=1):
                fail("Неправильний код.", 400)
            c.execute("UPDATE owner_totp SET enabled=1 WHERE uid=?", (me["id"],))
            audit(c, me["id"], "totp.enabled")
        return {"ok": True}

    @app.post("/api/admin/totp/unlock")
    def totp_unlock(body: TotpCode, request: Request):
        me = require_owner(request)
        limit(request, 5, 300)
        import pyotp
        with db() as c:
            row = c.execute("SELECT secret,enabled FROM owner_totp WHERE uid=?",
                            (me["id"],)).fetchone()
            if not row or not row["enabled"] or not pyotp.TOTP(row["secret"]).verify(
                    body.code, valid_window=1):
                fail("Неправильний код.", 403)
            token = request.cookies.get("cloux_session", "")
            c.execute("""INSERT INTO owner_totp_sessions(session_hash,uid,expires)
                VALUES(?,?,?) ON CONFLICT(session_hash) DO UPDATE SET expires=excluded.expires""",
                (hashlib.sha256(token.encode()).hexdigest(), me["id"], int(time.time())+900))
            audit(c, me["id"], "totp.unlocked")
        return {"ok": True}
