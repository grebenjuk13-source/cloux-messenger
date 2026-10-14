"""Database connection selection for Cloux.

Local development keeps SQLite. Production can use a remote SQLite-compatible
Turso database so Render's ephemeral container disk is never the only copy.
"""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

TURSO_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()
REQUIRE_DURABLE_STORAGE = (
    os.getenv("CLOUX_REQUIRE_DURABLE_STORAGE", "").lower() in ("1", "true", "yes")
    or os.getenv("RENDER", "").lower() == "true"
)

if bool(TURSO_URL) != bool(TURSO_TOKEN):
    raise RuntimeError("Set both TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, or remove both.")
if REQUIRE_DURABLE_STORAGE and not TURSO_URL:
    raise RuntimeError("Durable storage is required. Configure Turso before starting Cloux.")

REMOTE_DATABASE = bool(TURSO_URL)
try:
    import turso_serverless
except ImportError:
    turso_serverless = None

if REMOTE_DATABASE and turso_serverless is None:
    raise RuntimeError("Turso database support is not installed.")

INTEGRITY_ERRORS: tuple[type[BaseException], ...] = (
    sqlite3.IntegrityError,
    *((turso_serverless.IntegrityError,) if turso_serverless is not None else ()),
)


def connect(database: Path, timeout: int = 12) -> Any:
    """Return a sqlite3-compatible connection for local or remote storage."""
    if REMOTE_DATABASE:
        connection = turso_serverless.connect(TURSO_URL, auth_token=TURSO_TOKEN)
        connection.row_factory = turso_serverless.Row
    else:
        connection = sqlite3.connect(database, timeout=timeout)
        connection.row_factory = sqlite3.Row

    connection.execute("PRAGMA foreign_keys=ON")
    return connection


def initialize_blob_table(db_context: Any) -> None:
    """Store user uploaded media in the same durable database as chat data."""
    with db_context() as connection:
        connection.execute("""CREATE TABLE IF NOT EXISTS cloux_blobs(
            storage_key TEXT PRIMARY KEY,
            mime TEXT NOT NULL,
            content BLOB NOT NULL,
            updated INTEGER NOT NULL)""")


def put_blob(connection: Any, key: str, mime: str, content: bytes, updated: int) -> None:
    connection.execute("""INSERT INTO cloux_blobs(storage_key,mime,content,updated)
        VALUES(?,?,?,?) ON CONFLICT(storage_key) DO UPDATE SET
        mime=excluded.mime,content=excluded.content,updated=excluded.updated""",
        (key, mime, content, updated))


def remove_blob(connection: Any, key: str) -> None:
    connection.execute("DELETE FROM cloux_blobs WHERE storage_key=?", (key,))
