"""Cloux stage 1: production-gated Twilio Verify and secure verified registration.

Without Twilio Verify credentials this module NEVER generates a pretend SMS code.
The existing legacy registration remains unchanged until CLOUX_REQUIRE_SMS is switched on
by the operator; then this flow is the sole registration path.
"""
import json
import base64
import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import time
import urllib.parse
import urllib.request
import urllib.error
from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import phonenumbers
from argon2 import PasswordHasher

PASSWORD_HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
GRANT_TTL_SECONDS = 10 * 60

def sms_configured():
    return all(os.getenv(x) for x in ("TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_VERIFY_SERVICE_SID"))

def phone_e164(raw):
    try:
        parsed=phonenumbers.parse(raw, None)
        if not phonenumbers.is_valid_number(parsed):
            return None
        return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        return None

def password_issues(password,phone,username):
    checks={
      "length": len(password)>=8,
      "upper": any(c.isupper() for c in password),
      "lower": any(c.islower() for c in password),
      "number": any(c.isdigit() for c in password),
      "symbol": any(not c.isalnum() and not c.isspace() for c in password),
      "no_spaces": not any(c.isspace() for c in password),
      "no_personal": username.lower() not in password.lower() and
          not any((len(chunk)>=5 and chunk in re.sub(r"\D", "",password)) for chunk in (re.sub(r"\D","",phone),re.sub(r"\D","",phone)[-7:]))
    }
    return [key for key,valid in checks.items() if not valid]

def _twilio(path, fields):
    sid=os.environ["TWILIO_ACCOUNT_SID"]
    token=os.environ["TWILIO_AUTH_TOKEN"]
    service=os.environ["TWILIO_VERIFY_SERVICE_SID"]
    url=f"https://verify.twilio.com/v2/Services/{urllib.parse.quote(service, safe='')}/{path}"
    auth=base64.b64encode(f"{sid}:{token}".encode()).decode()
    request=urllib.request.Request(url,data=urllib.parse.urlencode(fields).encode(),method="POST",
      headers={"Authorization":f"Basic {auth}","Content-Type":"application/x-www-form-urlencoded"})
    import json
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            return json.loads(response.read(16000))
    except (urllib.error.URLError,TimeoutError) as exc:
        raise RuntimeError("SMS-провайдер недоступний. Спробуйте пізніше.") from exc

class PhoneBody(BaseModel):
    phone: str = Field(min_length=8,max_length=30)

class SmsCheck(PhoneBody):
    code: str = Field(min_length=6,max_length=6,pattern=r"^\d{6}$")

class VerifiedRegistration(BaseModel):
    grant: str = Field(min_length=32,max_length=256)
    username: str = Field(min_length=4,max_length=24)
    display: str = Field(min_length=1,max_length=60)
    password: str = Field(min_length=8,max_length=128)


def install(app,db,auth,fail,limit,set_cookie,seed_user):
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS cloux_v5_grants(
        token_hash TEXT PRIMARY KEY,phone TEXT NOT NULL,expires INTEGER NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS cloux_v5_ui_prefs(
          uid TEXT PRIMARY KEY REFERENCES users(id),
          value TEXT NOT NULL DEFAULT '{}',
          updated INTEGER NOT NULL)""")
        c.execute("""CREATE TABLE IF NOT EXISTS cloux_v5_sms_limits(
        phone TEXT PRIMARY KEY,last_sent INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0)""")

    @app.get('/api/v5/config')
    def config():
        return {'sms_enabled':sms_configured(), 'strict_registration':os.getenv('CLOUX_REQUIRE_SMS')=='1',
                'avatar_url':'/assets/cloux-default-avatar.jpg', 'stage':1}

    @app.get('/api/v5/username')
    def username_check(request:Request,username:str=''):
        limit(request,40,60)
        name=username.strip().lower()
        valid=bool(re.fullmatch(r'[a-z0-9_]{4,24}',name))
        if not valid:return {'valid':False,'available':False}
        with db() as c:
            taken=bool(c.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE',(name,)).fetchone())
        return {'valid':True,'available':not taken}

    @app.post('/api/v5/sms/send')
    def sms_send(body:PhoneBody,request:Request):
        limit(request,4,3600)
        if not sms_configured():fail('SMS-підтвердження ще не підключено адміністратором.',503)
        phone=phone_e164(body.phone)
        if not phone:fail('Перевірте номер телефону та код країни.')
        now=int(time.time())
        with db() as c:
            row=c.execute('SELECT last_sent,attempts FROM cloux_v5_sms_limits WHERE phone=?',(phone,)).fetchone()
            if row and now-row['last_sent']<60:fail('Повторне SMS можна надіслати через хвилину.',429)
            if c.execute('SELECT 1 FROM users WHERE phone=?',(phone,)).fetchone():
                fail('Цей номер уже зареєстровано. Використайте вхід.',409)
            c.execute('INSERT INTO cloux_v5_sms_limits(phone,last_sent,attempts) VALUES(?,?,1) ON CONFLICT(phone) DO UPDATE SET last_sent=excluded.last_sent,attempts=attempts+1',(phone,now))
        try:
            _twilio('Verifications',{'To':phone,'Channel':'sms'})
        except RuntimeError as e:fail(str(e),503)
        return {'ok':True,'retry_after':60}

    @app.post('/api/v5/sms/check')
    def sms_check(body:SmsCheck,request:Request):
        limit(request,12,900)
        if not sms_configured():fail('SMS-підтвердження не налаштовано.',503)
        phone=phone_e164(body.phone)
        if not phone:fail('Номер телефону некоректний.')
        try:
            result=_twilio('VerificationCheck',{'To':phone,'Code':body.code})
        except RuntimeError as e:fail(str(e),503)
        if result.get('status')!='approved':fail('Неправильний або прострочений SMS-код.',401)
        grant=secrets.token_urlsafe(40)
        with db() as c:
            c.execute('DELETE FROM cloux_v5_grants WHERE expires<?',(int(time.time()),))
            c.execute('INSERT INTO cloux_v5_grants(token_hash,phone,expires) VALUES(?,?,?)',
                      (hashlib.sha256(grant.encode()).hexdigest(),phone,int(time.time())+GRANT_TTL_SECONDS))
        return {'grant':grant,'expires_in':GRANT_TTL_SECONDS}

    @app.post('/api/v5/register')
    def verified_register(body:VerifiedRegistration,request:Request):
        limit(request,8,3600)
        username=body.username.strip().lower()
        display=body.display.strip()
        if not re.fullmatch(r'[a-z0-9_]{4,24}',username):fail('Позивний має містити 4–24 латинські символи, цифри або _.')
        if not display:fail('Вкажіть ім’я.')
        with db() as c:
            row=c.execute('SELECT phone,expires FROM cloux_v5_grants WHERE token_hash=?',(hashlib.sha256(body.grant.encode()).hexdigest(),)).fetchone()
            if not row or row['expires']<time.time():fail('SMS-підтвердження закінчилося. Почніть реєстрацію знову.',401)
            problems=password_issues(body.password,row['phone'],username)
            if problems:fail('Пароль не відповідає вимогам: '+', '.join(problems))
            from uuid import uuid4
            uid=str(uuid4())
            try:
                c.execute('INSERT INTO users(id,phone,username,display,password_hash,created) VALUES(?,?,?,?,?,?)',
                  (uid,row['phone'],username,display,PASSWORD_HASHER.hash(body.password),int(time.time())))
                c.execute('DELETE FROM cloux_v5_grants WHERE token_hash=?',(hashlib.sha256(body.grant.encode()).hexdigest(),))
            except sqlite3.IntegrityError:fail('Номер або позивний уже зайнятий.',409)
        seed_user(db,uid)
        return set_cookie(JSONResponse({'ok':True}),uid)
    class UISettings(BaseModel):
        theme: str = 'dark'
        accent: str = '#54BBD6'
        wallpaper: str = 'w0'
        font_size: int = Field(default=15,ge=12,le=23)
        compact: bool = False
        glass: bool = True
        emoji_style: str = 'telegram'
        wall_blur: int = Field(default=0,ge=0,le=20)
        wall_dim: int = Field(default=12,ge=0,le=75)

    @app.get('/api/v5/ui-prefs')
    def get_ui_preferences(request:Request):
        user=auth(request)
        with db() as c:
            row=c.execute('SELECT value FROM cloux_v5_ui_prefs WHERE uid=?',(user['id'],)).fetchone()
        return {'preferences':json.loads(row['value']) if row else {}}

    @app.put('/api/v5/ui-prefs')
    def save_ui_preferences(body:UISettings,request:Request):
        user=auth(request)
        if body.theme not in ('dark','light','amoled','auto'):
            fail('Невідома тема.')
        if body.emoji_style not in ('apple','telegram'):
            fail('Невідомий набір емодзі.')
        if not re.fullmatch(r'#[0-9a-fA-F]{6}',body.accent):
            fail('Некоректний колір.')
        if body.wallpaper!='custom' and not (re.fullmatch(r'w\\d+',body.wallpaper) and 0<=int(body.wallpaper[1:])<34):
            fail('Невідомі шпалери.')
        data=body.model_dump_json()
        with db() as c:
            c.execute('INSERT INTO cloux_v5_ui_prefs(uid,value,updated) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET value=excluded.value,updated=excluded.updated',(user['id'],data,int(time.time())))
        return {'ok':True}
