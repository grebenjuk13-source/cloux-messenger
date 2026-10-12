"""Starts the actual Cloux FastAPI app using PostgreSQL (DATABASE_URL required)."""
import os

assert os.environ.get("DATABASE_URL"), "CI must configure DATABASE_URL"

from fastapi.testclient import TestClient
from main import app

with TestClient(app, base_url="https://testserver") as client:
    r = client.get("/api/health")
    assert r.status_code == 200, r.text
    assert r.json()["persistent_storage"], r.json()
    assert client.get("/api/public/config").status_code == 200
    alice = client.post("/api/v6/register", json={
        "email": "postgres-test@example.test",
        "phone": "+380671119988",
        "username": "pg_runner",
        "display": "Pg Runner",
        "password": "ExamplePass#123",
    })
    assert alice.status_code == 200, alice.text
    r = client.get("/api/me")
    assert r.status_code == 200, r.text
    assert r.json()["username"] == "pg_runner"
    chats = client.get("/api/chats")
    assert chats.status_code == 200, chats.text
    assert any(c["kind"] == "news" for c in chats.json()["chats"])
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401

# Reopen a new client. Database records should remain after login again.
with TestClient(app, base_url="https://testserver") as client:
    r = client.post("/api/v6/login", json={"identifier": "pg_runner", "password": "ExamplePass#123"})
    assert r.status_code == 200, r.text
    assert client.get("/api/me").json()["username"] == "pg_runner"
print("PostgreSQL Cloux startup + account + session roundtrip: PASS")
