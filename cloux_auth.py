"""Cloux account registration and login with a Cloux-only password."""
from __future__ import annotations

import re
import sqlite3
import time
import uuid

import phonenumbers
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


def clean_phone(raw: str) -> str | None:
    try:
        number = phonenumbers.parse(raw, None)
        if phonenumbers.is_valid_number(number):
            return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
    except (phonenumbers.NumberParseException, ValueError):
        pass
    return None


class PasswordRegistration(BaseModel):
    email: str = Field(min_length=6, max_length=254)
    phone: str = Field(min_length=8, max_length=30)
    password: str = Field(min_length=8, max_length=128)


class PasswordLogin(BaseModel):
    email: str = Field(min_length=6, max_length=254)
    password: str = Field(min_length=1, max_length=128)


def generated_profile(conn: sqlite3.Connection, email: str) -> tuple[str, str]:
    local = email.split('@', 1)[0]
    display = re.sub(r'[._+-]+', ' ', local).strip()[:60] or 'Cloux'
    base = re.sub(r'[^a-z0-9_]', '_', local.lower()).strip('_')
    if len(base) < 4:
        base = ('user_' + base).strip('_')
    base = base[:24] or 'user'
    for index in range(1000):
        suffix = '' if index == 0 else str(index + 1)
        candidate = base[:24 - len(suffix)] + suffix
        taken = conn.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', (candidate,)).fetchone()
        if not taken:
            return candidate, display
    raise RuntimeError('Не вдалося створити позивний Cloux.')


def install(app, db, fail, limit, set_cookie, seed_user):
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

    @app.post('/api/v6/register')
    def register(body: PasswordRegistration, request: Request):
        limit(request, 8, 3600)
        email = normalize_email(body.email)
        if not email:
            fail('Введіть коректну адресу електронної пошти.')
        phone = clean_phone(body.phone)
        if not phone:
            fail('Введіть номер телефону у міжнародному форматі, наприклад +380501234567.')
        if not 8 <= len(body.password) <= 128:
            fail('Пароль Cloux має містити від 8 до 128 символів.')

        user_id = str(uuid.uuid4())
        try:
            with db() as conn:
                conn.execute('BEGIN IMMEDIATE')
                if conn.execute('SELECT 1 FROM users WHERE email=? COLLATE NOCASE', (email,)).fetchone():
                    fail('Ця електронна адреса вже має акаунт. Увійдіть у Cloux.')
                if conn.execute('SELECT 1 FROM users WHERE phone=?', (phone,)).fetchone():
                    fail('Цей номер телефону вже прив’язаний до акаунта Cloux.')
                username, display = generated_profile(conn, email)
                conn.execute('''INSERT INTO users(id,email,phone,username,display,password_hash,created)
                    VALUES(?,?,?,?,?,?,?)''',
                    (user_id, email, phone, username, display, HASHER.hash(body.password), int(time.time())))
        except sqlite3.IntegrityError:
            fail('Ця електронна адреса або номер телефону вже використовується.', 409)

        seed_user(db, user_id)
        return set_cookie(JSONResponse({'ok': True}), user_id)

    @app.post('/api/v6/login')
    def login(body: PasswordLogin, request: Request):
        limit(request, 10, 900)
        email = normalize_email(body.email)
        if not email:
            fail('Введіть коректну адресу електронної пошти.')
        with db() as conn:
            user = conn.execute('''SELECT id,password_hash FROM users
                WHERE email=? COLLATE NOCASE''', (email,)).fetchone()
        if not user:
            fail('Електронна адреса або пароль Cloux неправильні.', 401)
        try:
            HASHER.verify(user['password_hash'], body.password)
        except Exception:
            fail('Електронна адреса або пароль Cloux неправильні.', 401)
        return set_cookie(JSONResponse({'ok': True}), user['id'])
