"""Minimal compatibility bridge from existing Cloux SQLite SQL to PostgreSQL.

Enable only with DATABASE_URL. A compatible schema is created by the existing
FastAPI startup modules; this keeps the current messenger routes intact.
"""
from __future__ import annotations

import re
import sqlite3
from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row


def postgres_sql(sql: str) -> str:
    value = sql.strip().rstrip(";").strip()
    if not value:
        return ""
    value = re.sub(r"\bCOLLATE\s+NOCASE\b", "", value, flags=re.I)
    value = re.sub(r"\bINTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT\b",
                   "BIGSERIAL PRIMARY KEY", value, flags=re.I)
    value = re.sub(r"\bINSERT\s+OR\s+IGNORE\s+INTO\b",
                   "INSERT INTO", value, flags=re.I)
    ignored = bool(re.match(r"INSERT\s+OR\s+IGNORE\s+INTO\b", sql, re.I))
    if ignored:
        value += " ON CONFLICT DO NOTHING"
    value = re.sub(r"strftime\(\s*'%s'\s*,\s*'now'\s*\)",
                   "CAST(EXTRACT(EPOCH FROM NOW()) AS INTEGER)", value, flags=re.I)
    # sqlite uses '?' bind parameters; this project's SQL doesn't use '?' literals.
    return value.replace("?", "%s")


class PgCursor:
    def __init__(self, cursor, lastrowid=None, prefetched=None):
        self._cursor = cursor
        self.lastrowid = lastrowid
        self._prefetched = prefetched

    def fetchone(self):
        if self._prefetched is not None:
            val = self._prefetched
            self._prefetched = None
            return val
        return self._cursor.fetchone()

    def fetchall(self):
        if self._prefetched is not None:
            val = [self._prefetched]
            self._prefetched = None
            return val + list(self._cursor.fetchall())
        return self._cursor.fetchall()

    def __iter__(self):
        if self._prefetched is not None:
            yield self._prefetched
            self._prefetched = None
        yield from self._cursor


class PgDatabase:
    def __init__(self, conn):
        self.conn = conn

    def execute(self, sql, args=None):
        text = sql.strip()
        # Preserve SQLite's schema-introspection API used in old migrations.
        pragma = re.fullmatch(r"PRAGMA\s+table_info\(\s*([A-Za-z_]\w*)\s*\)\s*;?",
                              text, flags=re.I)
        if pragma:
            q = """SELECT column_name AS name, data_type AS type
                   FROM information_schema.columns WHERE table_schema='public'
                   AND table_name=%s ORDER BY ordinal_position"""
            cur = self.conn.execute(q, (pragma.group(1),))
            return PgCursor(cur)
        if re.fullmatch(r"PRAGMA\s+foreign_keys\s*=\s*ON\s*;?", text, flags=re.I):
            return PgCursor(self.conn.execute("SELECT 1"))
        if "sqlite_master" in text.lower():
            cur = self.conn.execute("""SELECT table_name AS name
                FROM information_schema.tables WHERE table_schema='public'
                AND table_type='BASE TABLE'""")
            return PgCursor(cur)
        statement = postgres_sql(sql)
        if not statement:
            return PgCursor(self.conn.execute("SELECT 1 WHERE false"))
        is_message_insert = bool(re.match(r"INSERT\s+INTO\s+messages\s*\(", statement, re.I))
        if is_message_insert and "RETURNING" not in statement.upper():
            statement += " RETURNING id"
        try:
            cur = self.conn.execute(statement, args or ())
        except psycopg.errors.UniqueViolation as exc:
            raise sqlite3.IntegrityError("Unique constraint violation") from exc
        if is_message_insert:
            record = cur.fetchone()
            return PgCursor(cur, lastrowid=record["id"] if record else None)
        return PgCursor(cur)

    def executemany(self, sql, seq):
        try:
            cur = self.conn.cursor()
            cur.executemany(postgres_sql(sql), seq)
            return PgCursor(cur)
        except psycopg.errors.UniqueViolation as exc:
            raise sqlite3.IntegrityError("Unique constraint violation") from exc

    def executescript(self, script):
        # The existing scripts are plain DDL statements without function bodies
        # or semicolons within SQL string values.
        for part in script.split(";"):
            if part.strip():
                self.execute(part)

    def commit(self):
        self.conn.commit()

    def rollback(self):
        self.conn.rollback()

    def close(self):
        self.conn.close()


@contextmanager
def connect(url: str):
    conn = psycopg.connect(url, row_factory=dict_row, connect_timeout=15)
    wrapper = PgDatabase(conn)
    try:
        yield wrapper
    except BaseException:
        conn.rollback()
        raise
    else:
        conn.commit()
    finally:
        conn.close()
