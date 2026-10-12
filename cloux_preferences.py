"""Persist per-account interface preferences for the Cloux web client."""
from __future__ import annotations

import json
import re

from fastapi import Request
from pydantic import BaseModel, Field


class UISettings(BaseModel):
    theme: str = 'dark'
    accent: str = '#E11D2E'
    wallpaper: str = 'w0'
    font_size: int = Field(default=15, ge=12, le=23)
    compact: bool = False
    glass: bool = True
    emoji_style: str = 'telegram'
    wall_blur: int = Field(default=0, ge=0, le=20)
    wall_dim: int = Field(default=12, ge=0, le=75)
    animated_wallpaper: bool = True
    bubble_style: str = 'rounded'
    chat_previews: bool = True


def install(app, db, auth, fail, limit, set_cookie, seed_user):
    with db() as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS cloux_v5_ui_prefs(
            uid TEXT PRIMARY KEY REFERENCES users(id), value TEXT NOT NULL, updated INTEGER NOT NULL)''')
        # Remove obsolete one-time SMS registration state. No SMS codes are used by Cloux signup.
        conn.execute('DROP TABLE IF EXISTS cloux_v5_grants')
        conn.execute('DROP TABLE IF EXISTS cloux_v5_sms_limits')

    @app.get('/api/v5/ui-prefs')
    def get_ui_preferences(request: Request):
        user = auth(request)
        with db() as conn:
            row = conn.execute('SELECT value FROM cloux_v5_ui_prefs WHERE uid=?', (user['id'],)).fetchone()
        return {'preferences': json.loads(row['value']) if row else {}}

    @app.put('/api/v5/ui-prefs')
    def save_ui_preferences(body: UISettings, request: Request):
        user = auth(request)
        if body.theme not in ('dark', 'light', 'amoled', 'auto'):
            fail('Невідома тема.')
        if body.emoji_style not in ('apple', 'telegram'):
            fail('Невідомий набір емодзі.')
        if body.bubble_style not in ('rounded', 'soft', 'square'):
            fail('Невідомий стиль повідомлень.')
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', body.accent):
            fail('Некоректний колір.')
        if body.wallpaper != 'custom' and not (re.fullmatch(r'w[0-9]+', body.wallpaper) and 0 <= int(body.wallpaper[1:]) < 34):
            fail('Невідомі шпалери.')
        with db() as conn:
            conn.execute('''INSERT INTO cloux_v5_ui_prefs(uid,value,updated) VALUES(?,?,strftime('%s','now'))
                ON CONFLICT(uid) DO UPDATE SET value=excluded.value,updated=excluded.updated''',
                (user['id'], body.model_dump_json()))
        return {'ok': True}
