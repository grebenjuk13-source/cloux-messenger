"""Cloux account login with a Cloux-only password."""
from __future__ import annotations

import re
import sqlite3
import time

from argon2 import PasswordHasher
from fastapi import Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

HASHER = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)
EMAIL = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$")


def normalize_email(raw: str) -> str | None:
    value = raw.strip().lower()
    if len(value) > 254 or not EMAIL.fullmatch(value):
        return None
    local = value.split('@', 1)[0]
    if local.startswith('.') or local.endswith('.') or '..' in local:
        return None
    return value


class PasswordLogin(BaseModel):
    email: str = Field(default='', max_length=254)
    identifier: str = Field(default='', max_length=254)
    password: str = Field(min_length=1, max_length=128)

class Registration(BaseModel):
    email: str = Field(min_length=6, max_length=254)
    phone: str = Field(min_length=7, max_length=24)
    username: str = Field(min_length=3, max_length=32)
    display: str = Field(min_length=1, max_length=48)
    password: str = Field(min_length=8, max_length=128)


def install(app, db, fail, limit, set_cookie):
    with db() as conn:
        columns = {row['name'] for row in conn.execute('PRAGMA table_info(users)')}
        if 'email' not in columns:
            conn.execute('ALTER TABLE users ADD COLUMN email TEXT')
        tables = {row['name'] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if 'cloux_email_identity' in tables:
            # Keep access for accounts whose email was confirmed in the old flow.
            conn.execute('''UPDATE users SET email=(
                SELECT address FROM cloux_email_identity WHERE uid=users.id AND verified=1 LIMIT 1)
                WHERE email IS NULL AND EXISTS(
                SELECT 1 FROM cloux_email_identity WHERE uid=users.id AND verified=1)''')
        for table in ('cloux_email_codes', 'cloux_email_strikes', 'cloux_email_rate',
                      'cloux_email_grants', 'cloux_email_identity'):
            conn.execute(f'DROP TABLE IF EXISTS {table}')
        conn.execute('''CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique_idx
            ON users(email COLLATE NOCASE) WHERE email IS NOT NULL AND email<>'' ''')

    @app.post('/api/v6/login')
    def login(body: PasswordLogin, request: Request):
        limit(request, 10, 900)
        identifier = (body.identifier or body.email).strip()
        email = normalize_email(identifier)
        phone = re.sub(r'[^+0-9]', '', identifier)
        if not email and not re.fullmatch(r'[a-zA-Z0-9_]{3,32}', identifier) and (len(re.sub(r'\D', '', phone)) < 7 or len(phone) > 16):
            fail('Введіть коректну пошту або номер телефону.')
        with db() as conn:
            user = conn.execute('''SELECT id,password_hash FROM users
                WHERE (email=? COLLATE NOCASE AND ? IS NOT NULL) OR (phone=? AND ? IS NULL)
                OR (username=? COLLATE NOCASE AND ? IS NULL)''',
                (email, email, phone if not email else '', email,
                 identifier.lstrip('@') if not email else '', email)).fetchone()
        if not user:
            fail('Електронна адреса або пароль Cloux неправильні.', 401)
        try:
            HASHER.verify(user['password_hash'], body.password)
        except Exception:
            fail('Електронна адреса або пароль Cloux неправильні.', 401)
        return set_cookie(JSONResponse({'ok': True}), user['id'])

    @app.post('/api/v6/register')
    def register(body: Registration, request: Request):
        import cloux_admin
        with db() as conn:
            if not cloux_admin.flag(conn, 'registration') or cloux_admin.flag(conn, 'maintenance'):
                fail('Реєстрацію тимчасово призупинено.', 503)
        limit(request, 5, 3600)
        email = normalize_email(body.email)
        phone = re.sub(r'[^+0-9]', '', body.phone)
        username = body.username.strip().lstrip('@').lower()
        display = ' '.join(body.display.split())
        if not email:
            fail('Перевір адресу електронної пошти.')
        if len(re.sub(r'\D', '', phone)) < 7 or len(re.sub(r'\D', '', phone)) > 15:
            fail('Перевір номер телефону.')
        if not re.fullmatch(r'[a-z0-9_]{3,32}', username):
            fail('Нікнейм: латиниця, цифри й _ (від 3 символів).')
        if not display or len(display) > 48:
            fail('Вкажи ім’я (до 48 символів).')
        try:
            from uuid import uuid4
            uid = str(uuid4())
            with db() as conn:
                conn.execute('INSERT INTO users(id,phone,username,display,password_hash,created,email) VALUES(?,?,?,?,?,?,?)',
                             (uid, phone, username, display, HASHER.hash(body.password), int(time.time()), email))
        except sqlite3.IntegrityError:
            fail('Ця пошта, телефон або нікнейм уже використовуються.')
        return set_cookie(JSONResponse({'ok': True}), uid)

    @app.get('/api/v6/username-available')
    def username_available(username: str, request: Request):
        limit(request, 40, 60)
        name = username.strip().lstrip('@').lower()
        if not re.fullmatch(r'[a-z0-9_]{3,32}', name):
            return {'available': False, 'reason': 'Нікнейм: 3–32 символи, латиниця, цифри й _'}
        with db() as conn:
            taken = conn.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', (name,)).fetchone()
        return {'available': not bool(taken)}
