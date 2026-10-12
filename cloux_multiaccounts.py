"""Upgrade Cloux phone identifiers without destroying existing account/chat data.

The original users table has a UNIQUE(phone) constraint. A phone number is not a
unique account identity: username and verified email still are. This migration
preserves all existing columns, foreign-key references, indexes and triggers.
"""
from __future__ import annotations

import os
import re
import sqlite3
from pathlib import Path


def migrate_sqlite(path: Path) -> None:
    conn = sqlite3.connect(path, timeout=20)
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
        if not row:
            raise RuntimeError("Cloux users table does not exist")
        original = row["sql"]
        unique_phone = re.search(r"\bphone\s+TEXT\s+NOT\s+NULL\s+UNIQUE\b", original, re.I)
        if not unique_phone:
            conn.execute("CREATE INDEX IF NOT EXISTS users_phone_lookup_idx ON users(phone)")
            conn.commit()
            return
        old_indexes = [r["sql"] for r in conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='users' AND sql IS NOT NULL")]
        old_triggers = [r["sql"] for r in conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='trigger' AND tbl_name='users' AND sql IS NOT NULL")]
        new_sql = re.sub(r"\bphone\s+TEXT\s+NOT\s+NULL\s+UNIQUE\b",
                         "phone TEXT NOT NULL", original, count=1, flags=re.I)
        new_sql, replacements = re.subn(
            r"^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\"\u0060\[]?users[\"\u0060\]]?)\b",
            "CREATE TABLE users_multi_phone", new_sql, count=1, flags=re.I)
        if replacements != 1:
            raise RuntimeError("Unknown users table schema: migration stopped safely")
        # PRAGMA must be set outside a transaction. All DDL is transactionally
        # protected; rolling back restores both table and its linked records.
        conn.execute("PRAGMA foreign_keys=OFF")
        conn.execute("BEGIN IMMEDIATE")
        try:
            conn.execute(new_sql)
            conn.execute("INSERT INTO users_multi_phone SELECT * FROM users")
            conn.execute("DROP TABLE users")
            conn.execute("ALTER TABLE users_multi_phone RENAME TO users")
            for sql in old_indexes + old_triggers:
                conn.execute(sql)
            conn.execute("CREATE INDEX IF NOT EXISTS users_phone_lookup_idx ON users(phone)")
            problems = conn.execute("PRAGMA foreign_key_check").fetchall()
            if problems:
                raise RuntimeError("Foreign-key validation failed; previous users table retained")
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
    finally:
        conn.close()


def migrate(db_path: Path, db_factory) -> None:
    if os.getenv("DATABASE_URL"):
        with db_factory() as conn:
            conn.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key")
            conn.execute("CREATE INDEX IF NOT EXISTS users_phone_lookup_idx ON users(phone)")
    else:
        migrate_sqlite(db_path)
