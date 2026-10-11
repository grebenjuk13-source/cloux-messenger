"""Cloux one-click Resend OAuth: OAuth 2.1/PKCE with a short-lived one-time admin link.
Never transfers API keys through chat or browser JS. User approves on Resend.
Tokens are encrypted at rest. Free Render filesystem is not permanent.
"""
import base64
import hashlib
import hmac
import html
import json
import os
import secrets
import threading
import time
import urllib.parse
import urllib.request
from cryptography.fernet import Fernet
from fastapi import Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

BASE_URL = os.getenv("CLOUX_PUBLIC_URL", "https://cloux-messenger.onrender.com").rstrip("/")
META = BASE_URL + "/oauth/resend/client"
CALLBACK = BASE_URL + "/oauth/resend/callback"
SCOPE = "emails:send"
_MUTEX = threading.RLock()
_DB = None

def _crypto():
    from cloux_email import email_pepper
    pepper = email_pepper()
    if len(pepper) < 32:
        raise RuntimeError("Email encryption key is missing")
    secret = hashlib.sha256(b"cloux-resend-oauth-token-encryption-v1:" + pepper.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(secret))

def _request_token(params):
    data = urllib.parse.urlencode(params).encode("ascii")
    req = urllib.request.Request("https://api.resend.com/oauth/token", data=data,
                                 headers={"Content-Type":"application/x-www-form-urlencoded"},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=20) as response:
        parsed = json.load(response)
    if not parsed.get("access_token") or not parsed.get("refresh_token"):
        raise RuntimeError("Invalid Resend OAuth token response")
    return parsed

def connected():
    if _DB is None:
        return False
    with _DB() as con:
        return bool(con.execute("SELECT 1 FROM cloux_resend_oauth WHERE id=1").fetchone())

def access_token():
    if _DB is None:
        raise RuntimeError("Resend OAuth is not connected")
    with _MUTEX:
        with _DB() as con:
            row = con.execute("SELECT * FROM cloux_resend_oauth WHERE id=1").fetchone()
            if not row:
                raise RuntimeError("Resend OAuth not connected")
            fernet = _crypto()
            token = fernet.decrypt(row["access"].encode()).decode()
            if row["expires"] > int(time.time()) + 60:
                return token
            refresh = fernet.decrypt(row["refresh"].encode()).decode()
            data = _request_token({"grant_type":"refresh_token","refresh_token":refresh,
                                   "client_id":META})
            new_access = data["access_token"]
            new_refresh = data["refresh_token"]
            con.execute("UPDATE cloux_resend_oauth SET access=?,refresh=?,expires=? WHERE id=1",
                (fernet.encrypt(new_access.encode()).decode(),
                 fernet.encrypt(new_refresh.encode()).decode(),
                 int(time.time()) + int(data.get("expires_in",900))))
            return new_access

def _page(title, description, color="#f7f7f9"):
    return HTMLResponse("""<!DOCTYPE html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8">
<title>Cloux · Resend</title><style>html{color-scheme:dark}body{font-family:system-ui,-apple-system,sans-serif;background:radial-gradient(ellipse at top,#5c1428,#09090e 58%);color:#f5f5f6;min-height:90dvh;display:grid;place-items:center;margin:0;padding:16px}.card{width:min(440px,100%);background:#1d1e26dd;border:1px solid #ffffff32;border-radius:26px;padding:27px;box-shadow:0 20px 70px #0008}.brand{font-size:30px;font-weight:800;letter-spacing:-1px}.brand span{color:#ee3a55}h1{font-size:22px;margin:20px 0 10px}p{line-height:1.6;color:#c8c8ce}.btn{display:block;text-align:center;color:#fff;background:#df2843;border-radius:14px;padding:14px;margin-top:22px;text-decoration:none;font-weight:700}</style>
<div class="card"><div class="brand">Cloux<span>.</span></div><h1>""" + html.escape(title) + """</h1><p>""" + html.escape(description) + """</p><a class="btn" href="/">Відкрити Cloux</a></div></html>""",headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"})

def _authorized_link(token):
    expected = os.getenv("CLOUX_MAIL_SETUP_SHA256","").strip().lower()
    deadline = int(os.getenv("CLOUX_MAIL_SETUP_DEADLINE","0") or "0")
    if len(token) < 32 or time.time() > deadline or len(expected) != 64:
        return False
    candidate = hashlib.sha256(token.encode()).hexdigest()
    return hmac.compare_digest(candidate, expected)

def install(app,db):
    global _DB
    _DB = db
    with db() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS cloux_resend_oauth(
         id INTEGER PRIMARY KEY CHECK(id=1),access TEXT NOT NULL,refresh TEXT NOT NULL,
         expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_resend_pending(
         state TEXT PRIMARY KEY,verifier TEXT NOT NULL,expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_resend_provisioning(
         id INTEGER PRIMARY KEY CHECK(id=1),used INTEGER NOT NULL DEFAULT 0);
        INSERT OR IGNORE INTO cloux_resend_provisioning(id,used) VALUES(1,0);
        """)

    @app.get("/oauth/resend/client")
    def metadata():
        return JSONResponse({
            "client_name":"Cloux Messenger",
            "client_uri":BASE_URL,
            "redirect_uris":[CALLBACK],
            "grant_types":["authorization_code","refresh_token"],
            "response_types":["code"],
            "token_endpoint_auth_method":"none",
            "scope":SCOPE,
        },headers={"Cache-Control":"public,max-age=300"})

    @app.get("/admin/mail")
    def mail_setup():
        # Setup token lives in URL fragment, so it never enters server logs.
        return HTMLResponse("""<!doctype html><html lang="uk"><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8">
<title>Cloux · Підключення пошти</title><style>html{color-scheme:dark}body{font-family:system-ui,-apple-system,sans-serif;background:radial-gradient(ellipse at top,#6b1b31,#09090d 62%);color:white;min-height:90dvh;display:grid;place-items:center;margin:0;padding:16px}.card{max-width:460px;background:#1c1c24e8;border:1px solid #ffffff33;border-radius:28px;padding:28px;box-shadow:0 20px 65px #0008}.brand{font-size:35px;font-weight:850}.brand i{color:#f23a56;font-style:normal}h1{font-size:23px}p{color:#bfbfc9;line-height:1.6}.status{background:#ffffff10;border:1px solid #ffffff18;padding:13px;border-radius:12px}.btn{background:#d91e3d;padding:14px;border-radius:15px;color:white;border:none;font:700 15px system-ui;cursor:pointer;width:100%;margin-top:18px}</style><div class="card"><div class="brand">Cloux<i>.</i></div><h1>Підключення Gmail-кодів</h1><p>Ти підтверджуєш доступ на офіційному сайті Resend. Cloux отримає лише дозвіл надсилати листи, без доступу до вхідної пошти та без API-ключів.</p><div class="status" id="status">Перевіряємо запрошення…</div><button class="btn" id="retry" style="display:none">Спробувати ще раз</button></div>
<script>
const token=new URLSearchParams(location.hash.slice(1)).get("setup")||"";
history.replaceState(null,"",location.pathname);
const status=document.getElementById("status"),button=document.getElementById("retry");
async function start(){
 if(!token){status.textContent="Посилання для підключення відсутнє або недійсне.";return}
 status.textContent="Підготовка захищеного підключення…";
 button.style.display="none";
 try{
  const r=await fetch("/api/admin/mail/start",{method:"POST",credentials:"omit",
    headers:{"Content-Type":"application/json"},body:JSON.stringify({token})});
  const payload=await r.json();
  if(!r.ok)throw Error(payload.detail||"Не вдалося підключитися");
  if(!payload.authorize_url?.startsWith("https://api.resend.com/oauth/authorize?"))throw Error("Неправильна адреса авторизації");
  location.assign(payload.authorize_url);
 }catch(e){status.textContent=e.message;button.style.display="block"}
}
button.onclick=start;
start();
</script></html>""",headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; connect-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"})

    from pydantic import BaseModel
    class SetupBody(BaseModel):
        token: str

    @app.post("/api/admin/mail/start")
    def begin(body:SetupBody,request:Request):
        from fastapi import HTTPException
        # Only generated link authorizes this setup, not any Cloux account.
        origin=request.headers.get("origin")
        if origin and origin.rstrip("/") != BASE_URL:
            raise HTTPException(status_code=403,detail="Недійсне джерело запиту.")
        if not _authorized_link(body.token):
            raise HTTPException(status_code=403,detail="Посилання недійсне або термін його дії минув.")
        with db() as con:
            state_row=con.execute("SELECT used FROM cloux_resend_provisioning WHERE id=1").fetchone()
            if state_row and state_row["used"]:
                raise HTTPException(status_code=409,detail="Пошта вже була підключена.")
            state=secrets.token_urlsafe(32)
            verifier=secrets.token_urlsafe(48)
            challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
            con.execute("DELETE FROM cloux_resend_pending WHERE expires<?",(int(time.time()),))
            con.execute("INSERT INTO cloux_resend_pending(state,verifier,expires) VALUES(?,?,?)",
                        (state,verifier,int(time.time())+600))
        params={"client_id":META,"response_type":"code","redirect_uri":CALLBACK,
                "scope":SCOPE,"state":state,"code_challenge":challenge,
                "code_challenge_method":"S256"}
        return {"authorize_url":"https://api.resend.com/oauth/authorize?"+urllib.parse.urlencode(params)}

    @app.get("/oauth/resend/callback")
    def callback(request:Request,code:str="",state:str="",error:str=""):
        if error or not code or not state:
            return _page("Підключення скасовано","Resend не надав дозвіл. Можеш повторити підключення.")
        with db() as con:
            row=con.execute("SELECT verifier,expires FROM cloux_resend_pending WHERE state=?",(state,)).fetchone()
            con.execute("DELETE FROM cloux_resend_pending WHERE state=?",(state,))
            if not row or row["expires"] < time.time():
                return _page("Посилання застаріло","Спробуй підключити пошту ще раз.")
            if con.execute("SELECT used FROM cloux_resend_provisioning WHERE id=1").fetchone()["used"]:
                return _page("Підключення вже завершене","Повторна авторизація за цим посиланням недоступна.")
        try:
            payload=_request_token({"grant_type":"authorization_code","client_id":META,
                                    "code":code,"redirect_uri":CALLBACK,
                                    "code_verifier":row["verifier"]})
            fernet=_crypto()
            with db() as con:
                con.execute("""INSERT INTO cloux_resend_oauth(id,access,refresh,expires)
                  VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET
                  access=excluded.access,refresh=excluded.refresh,expires=excluded.expires""",
                 (fernet.encrypt(payload["access_token"].encode()).decode(),
                  fernet.encrypt(payload["refresh_token"].encode()).decode(),
                  int(time.time())+int(payload.get("expires_in",900))))
                con.execute("UPDATE cloux_resend_provisioning SET used=1 WHERE id=1")
            return _page("Resend підключено!","Cloux отримав дозвіл надсилати поштові коди. Якщо домен відправника підтверджений у Resend, реєстрація тепер працюватиме.")
        except Exception:
            return _page("Не вдалося завершити підключення","Resend не видав доступ. Спробуй ще раз, поки посилання дійсне.")
