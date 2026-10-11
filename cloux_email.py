"""Cloux Gmail verification and account recovery.

The Python/FastAPI host sends through Gmail SMTP or Resend HTTPS; it never
contains provider secrets in the frontend. Codes are HMAC-SHA256 digests,
never logged or stored in plaintext, expire in 10 minutes, have 5 attempts,
and are one-use. Email and IP limits are persisted in SQLite.

Pending verification creates a *pending identity*, not an authorized account.
No session is issued until verified grant is consumed by registration.
"""
from __future__ import annotations
import hashlib
import hmac
import json
import os
import re
import secrets
import smtplib
import sqlite3
import ssl
import time
import urllib.error
import urllib.request
import uuid
from email.message import EmailMessage
from email.utils import formataddr

import phonenumbers
from argon2 import PasswordHasher
from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

OTP_LIFETIME = 600
COOLDOWN = 60
LOCK_TIME = 900
MAX_ATTEMPTS = 5
MAX_HOURLY_SENDS = 5
GRANT_LIFETIME = 600
HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)


def valid_gmail(raw: str) -> tuple[str, str] | None:
    """Return delivery address and canonical key (Gmail aliases unify)."""
    value = raw.strip().lower()
    if len(value) > 254 or not re.fullmatch(r'[a-z0-9][a-z0-9.+_-]{0,62}@(?:gmail\.com|googlemail\.com)', value):
        return None
    local, _ = value.split('@')
    if '..' in local or local.endswith('.') or '+.' in local:
        return None
    canonical = local.split('+', 1)[0].replace('.', '')
    if not canonical or len(canonical) > 64:
        return None
    return value, canonical + '@gmail.com'


def email_ready() -> bool:
    key = os.getenv('CLOUX_EMAIL_PEPPER', '')
    if len(key) < 32:
        return False
    provider = os.getenv('CLOUX_EMAIL_PROVIDER', 'resend').lower()
    if provider == 'resend':
        return bool(os.getenv('RESEND_API_KEY') and os.getenv('CLOUX_EMAIL_FROM'))
    if provider == 'smtp':
        return bool(os.getenv('GMAIL_SMTP_USER') and os.getenv('GMAIL_SMTP_APP_PASSWORD'))
    return False


def digest(kind: str, value: str) -> str:
    key = os.environ.get('CLOUX_EMAIL_PEPPER', '')
    if len(key) < 32:
        raise RuntimeError('Надсилання пошти ще не налаштоване.')
    return hmac.new(key.encode('utf-8'), (kind + ':' + value).encode('utf-8'), hashlib.sha256).hexdigest()


def password_problems(password: str, email: str, username: str) -> list[str]:
    local = email.split('@')[0].split('+')[0].replace('.', '').lower()
    lower = password.lower()
    checks = {
        'мінімум 8 символів': len(password) >= 8,
        'велика літера': any(x.isupper() for x in password),
        'мала літера': any(x.islower() for x in password),
        'цифра': any(x.isdigit() for x in password),
        'спеціальний символ': any(not x.isalnum() and not x.isspace() for x in password),
        'без пробілів': not any(x.isspace() for x in password),
        'не містить пошту чи позивний': email.lower() not in lower and username.lower() not in lower and local not in lower,
    }
    return [name for name, passed in checks.items() if not passed]


def clean_phone(raw: str) -> str | None:
    try:
        number = phonenumbers.parse(raw, None)
        if not phonenumbers.is_valid_number(number):
            return None
        return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
    except (phonenumbers.NumberParseException, ValueError):
        return None


def send_email(address: str, code: str, purpose: str) -> None:
    """Only send through configured provider; never simulate delivery."""
    subject = 'Код підтвердження Cloux' if purpose == 'register' else 'Відновлення пароля Cloux'
    html = f'''<!doctype html><html lang="uk"><meta charset="utf-8"><body style="background:#0b0d14;color:#fff;font-family:Arial,sans-serif;padding:35px">
    <div style="max-width:480px;margin:auto;background:#1b222f;border:1px solid #526079;border-radius:28px;padding:35px;text-align:center">
    <h1 style="font-size:34px;margin:0;color:#fff">Cloux.</h1><p style="color:#bdc8d7">{subject}</p>
    <div style="letter-spacing:10px;font-size:42px;font-weight:800;color:#fff;padding:25px 0">{code}</div>
    <p style="line-height:1.7;color:#bdc8d7">Код діє 10 хвилин. Нікому не повідомляйте його. Якщо ви не запитували код, просто проігноруйте лист.</p>
    </div></body></html>'''
    provider = os.getenv('CLOUX_EMAIL_PROVIDER', 'resend').lower()
    if provider == 'resend':
        payload = json.dumps({'from': os.environ['CLOUX_EMAIL_FROM'], 'to': [address],
                              'subject': subject, 'html': html}).encode('utf-8')
        req = urllib.request.Request('https://api.resend.com/emails', data=payload,
             headers={'Authorization': 'Bearer ' + os.environ['RESEND_API_KEY'],
                      'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(req, timeout=15) as response:
            if response.status not in (200, 201, 202):
                raise RuntimeError('Сервіс листів тимчасово недоступний.')
    elif provider == 'smtp':
        email = EmailMessage()
        email['From'] = formataddr(('Cloux Messenger', os.environ['GMAIL_SMTP_USER']))
        email['To'] = address
        email['Subject'] = subject
        email.set_content('Cloux: ваш код ' + code + '. Він діє 10 хвилин. Нікому не повідомляйте код.')
        email.add_alternative(html, subtype='html')
        with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=15, context=ssl.create_default_context()) as smtp:
            smtp.login(os.environ['GMAIL_SMTP_USER'], os.environ['GMAIL_SMTP_APP_PASSWORD'])
            smtp.send_message(email)
    else:
        raise RuntimeError('Поштового провайдера не налаштовано.')


class EmailOnly(BaseModel):
    email: str = Field(min_length=6, max_length=254)
    purpose: str = Field(default='register', pattern=r'^(register|recovery)$')


class VerifyCode(EmailOnly):
    code: str = Field(pattern=r'^\d{6}$')


class FinishRegistration(BaseModel):
    email: str = Field(min_length=6, max_length=254)
    grant: str = Field(min_length=32, max_length=200)
    phone: str = Field(min_length=8, max_length=30)
    username: str = Field(min_length=4, max_length=24)
    display: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=8, max_length=128)


class EmailLogin(BaseModel):
    email: str
    password: str


class ResetPassword(BaseModel):
    email: str
    grant: str = Field(min_length=32, max_length=200)
    password: str = Field(min_length=8, max_length=128)


def install(app, db, fail, limit, set_cookie, seed_user):
    with db() as conn:
        conn.executescript('''
        CREATE TABLE IF NOT EXISTS cloux_email_identity(
          key TEXT PRIMARY KEY, address TEXT NOT NULL,
          uid TEXT UNIQUE REFERENCES users(id), verified INTEGER NOT NULL DEFAULT 0,
          created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_email_codes(
          key TEXT NOT NULL, purpose TEXT NOT NULL,
          digest TEXT NOT NULL, expires INTEGER NOT NULL, issued INTEGER NOT NULL,
          PRIMARY KEY (key, purpose));
        CREATE TABLE IF NOT EXISTS cloux_email_strikes(
          key TEXT NOT NULL, purpose TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
          blocked_until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (key,purpose));
        CREATE TABLE IF NOT EXISTS cloux_email_rate(
          bucket TEXT NOT NULL, created INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS cloux_email_rate_idx ON cloux_email_rate(bucket,created);
        CREATE TABLE IF NOT EXISTS cloux_email_grants(
          digest TEXT PRIMARY KEY, key TEXT NOT NULL, purpose TEXT NOT NULL, expires INTEGER NOT NULL);
        ''')

    def need_email(raw):
        parsed = valid_gmail(raw)
        if not parsed:
            fail('Введіть коректну адресу @gmail.com або @googlemail.com.')
        return parsed

    def source(request: Request) -> str:
        # Do not use untrusted X-Forwarded-For; the reverse proxy must set request.client.
        address = request.client.host if request.client else 'unknown'
        return digest('ip', address)

    @app.get('/api/v6/config')
    def config():
        return {'email_enabled': email_ready(), 'code_length': 6,
                'code_ttl': OTP_LIFETIME, 'retry_after': COOLDOWN,
                'registration': 'gmail', 'legacy_login': True}

    @app.post('/api/v6/email/send')
    def send_code(body: EmailOnly, request: Request):
        email, key = need_email(body.email)
        if not email_ready():
            fail('Пошта Cloux ще не підключена адміністратором. Код не надіслано.', 503)
        now = int(time.time())
        ip_key = source(request)
        email_bucket = 'email:' + digest('bucket', key)
        ip_bucket = 'ip:' + ip_key
        code = f'{secrets.randbelow(1000000):06d}'
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            conn.execute('DELETE FROM cloux_email_rate WHERE created<?', (now-3600,))
            counts = [conn.execute('SELECT count(*) AS n FROM cloux_email_rate WHERE bucket=?',(b,)).fetchone()['n'] for b in (email_bucket,ip_bucket)]
            if any(n >= MAX_HOURLY_SENDS for n in counts):
                fail('Забагато запитів. Спробуйте через годину.', 429)
            strikes=conn.execute('SELECT attempts,blocked_until FROM cloux_email_strikes WHERE key=? AND purpose=?',(key,body.purpose)).fetchone()
            if strikes and strikes['blocked_until']>now:
                fail('Забагато неправильних кодів. Спробуйте через 15 хвилин.',429)
            active=conn.execute('SELECT issued FROM cloux_email_codes WHERE key=? AND purpose=?',(key,body.purpose)).fetchone()
            if active and now-active['issued']<COOLDOWN:
                fail('Зачекайте 60 секунд перед повторним надсиланням.',429)
            identity=conn.execute('SELECT uid FROM cloux_email_identity WHERE key=?',(key,)).fetchone()
            if body.purpose=='register' and identity and identity['uid']:
                fail('Ця пошта вже зареєстрована. Скористайтеся входом.',409)
            # Generic response when recovery email does not exist prevents enumeration.
            deliver=body.purpose=='register' or bool(identity and identity['uid'])
            for bucket in (email_bucket,ip_bucket):
                conn.execute('INSERT INTO cloux_email_rate(bucket,created) VALUES(?,?)',(bucket,now))
            if body.purpose=='register':
                conn.execute('''INSERT INTO cloux_email_identity(key,address,created) VALUES(?,?,?)
                        ON CONFLICT(key) DO UPDATE SET address=excluded.address''',(key,email,now))
            if deliver:
                conn.execute('''INSERT INTO cloux_email_codes(key,purpose,digest,expires,issued) VALUES(?,?,?,?,?)
                    ON CONFLICT(key,purpose) DO UPDATE SET digest=excluded.digest,expires=excluded.expires,issued=excluded.issued''',
                    (key,body.purpose,digest('code', key + ':' + body.purpose + ':' + code),now+OTP_LIFETIME,now))
                # A resend never erases previous wrong-code attempts.
            else:
                code = None
        if code is not None:
            try:
                send_email(email, code, body.purpose)
            except (RuntimeError,urllib.error.URLError,smtplib.SMTPException,TimeoutError,OSError,KeyError):
                with db() as conn:
                    conn.execute('DELETE FROM cloux_email_codes WHERE key=? AND purpose=? AND digest=?',
                       (key,body.purpose,digest('code', key + ':' + body.purpose + ':' + code)))
                fail('Не вдалося надіслати лист. Перевірте поштовий сервіс і повторіть пізніше.',503)
        return {'ok':True,'retry_after':COOLDOWN}

    @app.post('/api/v6/email/verify')
    def verify_code(body: VerifyCode, request: Request):
        email, key = need_email(body.email)
        limit(request,35,900)
        if not email_ready():
            fail('Пошта Cloux не налаштована.',503)
        now=int(time.time())
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            strikes=conn.execute('SELECT attempts,blocked_until FROM cloux_email_strikes WHERE key=? AND purpose=?',(key,body.purpose)).fetchone()
            if strikes and strikes['blocked_until']>now:
                fail('Надто багато спроб. Спробуйте через 15 хвилин.',429)
            entry=conn.execute('SELECT digest,expires FROM cloux_email_codes WHERE key=? AND purpose=?',(key,body.purpose)).fetchone()
            tested=digest('code',key + ':' + body.purpose + ':' + body.code)
            valid=bool(entry and entry['expires']>=now and hmac.compare_digest(entry['digest'],tested))
            if not valid:
                attempts=(strikes['attempts'] if strikes else 0)+1
                block=now+LOCK_TIME if attempts>=MAX_ATTEMPTS else 0
                conn.execute('''INSERT INTO cloux_email_strikes(key,purpose,attempts,blocked_until) VALUES(?,?,?,?)
                   ON CONFLICT(key,purpose) DO UPDATE SET attempts=excluded.attempts,blocked_until=excluded.blocked_until''',
                   (key,body.purpose,0 if block else attempts,block))
                # Do not issue token, ever, on failed verification.
                result=None
            else:
                conn.execute('DELETE FROM cloux_email_codes WHERE key=? AND purpose=?',(key,body.purpose))
                conn.execute('DELETE FROM cloux_email_strikes WHERE key=? AND purpose=?',(key,body.purpose))
                grant=secrets.token_urlsafe(40)
                conn.execute('INSERT INTO cloux_email_grants(digest,key,purpose,expires) VALUES(?,?,?,?)',
                             (digest('grant',grant),key,body.purpose,now+GRANT_LIFETIME))
                if body.purpose=='register':
                    conn.execute('UPDATE cloux_email_identity SET verified=1 WHERE key=?',(key,))
                result=grant
        if result is None:
            fail('Код неправильний або термін дії минув.',401)
        if body.purpose == 'recovery':
            with db() as conn:
                r=conn.execute('SELECT u.username FROM cloux_email_identity e JOIN users u ON u.id=e.uid WHERE e.key=?',(key,)).fetchone()
            return {'grant':result,'expires_in':GRANT_LIFETIME,'username':r['username'] if r else ''}
        return {'grant':result,'expires_in':GRANT_LIFETIME}

    @app.post('/api/v6/register')
    def register(body: FinishRegistration, request: Request):
        limit(request,12,3600)
        email,key=need_email(body.email)
        phone=clean_phone(body.phone)
        if not phone:
            fail('Номер телефону некоректний. Перевірте код країни.')
        username=body.username.strip().lower()
        display=body.display.strip()
        if not re.fullmatch(r'[a-z0-9_]{4,24}',username) or not display:
            fail('Перевірте ім’я та @username.')
        problems=password_problems(body.password,email,username)
        if problems:
            fail('Пароль не відповідає вимогам: ' + ', '.join(problems))
        now=int(time.time())
        from_uuid=str(uuid.uuid4())
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            grant_hash=digest('grant',body.grant)
            grant=conn.execute('''SELECT key,expires FROM cloux_email_grants
                WHERE digest=? AND purpose='register' ''',(grant_hash,)).fetchone()
            ident=conn.execute('SELECT uid,verified FROM cloux_email_identity WHERE key=?',(key,)).fetchone()
            if not grant or grant['key']!=key or grant['expires']<now or not ident or ident['uid'] or not ident['verified']:
                fail('Підтвердження пошти застаріло. Потрібен новий код.',401)
            try:
                conn.execute('INSERT INTO users(id,phone,username,display,password_hash,created) VALUES(?,?,?,?,?,?)',
                             (from_uuid,phone,username,display,HASHER.hash(body.password),now))
                conn.execute('UPDATE cloux_email_identity SET uid=? WHERE key=?',(from_uuid,key))
                conn.execute('DELETE FROM cloux_email_grants WHERE digest=?',(grant_hash,))
            except sqlite3.IntegrityError:
                fail('Цей телефон або @username уже використовується.',409)
        seed_user(db,from_uuid)
        return set_cookie(JSONResponse({'ok':True}),from_uuid)

    @app.post('/api/v6/login')
    def login(body: EmailLogin, request: Request):
        limit(request,12,900)
        _,key=need_email(body.email)
        with db() as conn:
            x=conn.execute('''SELECT e.uid,e.verified,u.password_hash FROM cloux_email_identity e
                JOIN users u ON u.id=e.uid WHERE e.key=?''',(key,)).fetchone()
        if not x:
            with db() as conn:
                pending=bool(conn.execute('SELECT 1 FROM cloux_email_identity WHERE key=? AND verified=0', (key,)).fetchone())
            if pending:
                fail('Підтвердіть пошту кодом, перш ніж входити.',403)
            fail('Неправильна пошта або пароль.',401)
        if not x['verified']:
            fail('Підтвердіть пошту кодом, перш ніж входити.',403)
        try:
            HASHER.verify(x['password_hash'],body.password)
        except Exception:
            fail('Неправильна пошта або пароль.',401)
        return set_cookie(JSONResponse({'ok':True}),x['uid'])

    @app.post('/api/v6/password/reset')
    def reset_password(body: ResetPassword, request: Request):
        limit(request,12,3600)
        _,key=need_email(body.email)
        with db() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row=conn.execute('''SELECT e.uid,u.username FROM cloux_email_identity e
                JOIN users u ON u.id=e.uid WHERE e.key=? AND e.verified=1''',(key,)).fetchone()
            grant_hash=digest('grant',body.grant)
            grant=conn.execute("SELECT key,expires FROM cloux_email_grants WHERE digest=? AND purpose='recovery'",(grant_hash,)).fetchone()
            if not row or not grant or grant['key']!=key or grant['expires']<int(time.time()):
                fail('Посилання відновлення недійсне. Запитайте новий код.',401)
            address=conn.execute('SELECT address FROM cloux_email_identity WHERE key=?',(key,)).fetchone()['address']
            issues=password_problems(body.password,address,row['username'])
            if issues:
                fail('Пароль не відповідає вимогам: ' + ', '.join(issues))
            conn.execute('UPDATE users SET password_hash=? WHERE id=?',(HASHER.hash(body.password),row['uid']))
            conn.execute('DELETE FROM sessions WHERE uid=?',(row['uid'],))
            conn.execute('DELETE FROM cloux_email_grants WHERE digest=?',(grant_hash,))
        return {'ok':True}