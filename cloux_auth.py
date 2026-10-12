"""Cloux account login with a Cloux-only password."""
from __future__ import annotations

import re
import sqlite3

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
    email: str = Field(min_length=6, max_length=254)
    password: str = Field(min_length=1, max_length=128)


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
