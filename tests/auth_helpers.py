"""Test-only account setup. Production has no self-service account-creation endpoint."""
import time
import uuid

from cloux_auth import HASHER
from main import db


def create_account(client, *, phone, username, display, password, email=None):
    user_id = "test_" + uuid.uuid4().hex
    password_hash = HASHER.hash(password)
    with db() as conn:
        conn.execute(
            "INSERT INTO users(id,phone,username,display,password_hash,created,email) VALUES(?,?,?,?,?,?,?)",
            (user_id, phone, username, display, password_hash, int(time.time()), email),
        )
    result = client.post("/api/login", json={"phone": phone, "password": password})
    assert result.status_code == 200, result.text
    return user_id
