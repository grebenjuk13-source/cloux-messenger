"""Regression tests for private owner access, badges and durable cookie sessions."""
import shutil

import pytest
from fastapi.testclient import TestClient

import main
import cloux_admin

HOST = "https://testserver"


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    # Copy the fully initialized schema into a separate SQLite file.
    target = tmp_path / "cloux_test.db"
    shutil.copyfile(main.DB, target)
    monkeypatch.setattr(main, "DB", target)
    main.requests_by_ip.clear()
    monkeypatch.setenv("OWNER_EMAIL", "verified-admin@example.test")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    client = TestClient(main.app, base_url=HOST)
    yield client


def register(client, email, username, phone):
    return client.post("/api/v6/register", json={
        "email": email, "phone": phone,
        "username": username, "display": username,
        "password": "SafeTestPass#12345",
    })


def test_owner_requires_proof_of_mailbox_and_is_server_only(app_client, monkeypatch):
    admin = app_client
    unverified = register(admin, "verified-admin@example.test", "tester_admin", "+380670000111")
    assert unverified.status_code == 200, unverified.text
    assert admin.get("/api/me").json()["is_admin"] is False
    assert admin.get("/api/admin/overview").status_code == 403

    with TestClient(main.app, base_url=HOST) as other:
        response = register(other, "someone@example.test", "tester_other", "+380670000222")
        assert response.status_code == 200, response.text
        assert other.get("/api/admin/overview").status_code in (401, 403)
        assert other.post("/api/account/verify-email/send").status_code == 403

    sent = []
    monkeypatch.setattr(cloux_admin, "send_code", lambda address, code: sent.append((address, code)))
    response = admin.post("/api/account/verify-email/send")
    assert response.status_code == 200, response.text
    assert sent[0][0] == "verified-admin@example.test"
    wrong = admin.post("/api/account/verify-email/confirm", json={"code": "111111"})
    if sent[0][1] != "111111":
        assert wrong.status_code == 400
    ok = admin.post("/api/account/verify-email/confirm", json={"code": sent[0][1]})
    assert ok.status_code == 200, ok.text
    assert admin.get("/api/me").json()["is_admin"] is True
    assert admin.get("/api/admin/overview").status_code == 200


def test_badge_toggle_and_global_theme_are_enforced(app_client, monkeypatch):
    client = app_client
    assert register(client, "verified-admin@example.test", "admin_badges", "+380670000333").status_code == 200
    codes = []
    monkeypatch.setattr(cloux_admin, "send_code", lambda address, code: codes.append(code))
    assert client.post("/api/account/verify-email/send").status_code == 200
    assert client.post("/api/account/verify-email/confirm", json={"code": codes[-1]}).status_code == 200
    with TestClient(main.app, base_url=HOST) as other:
        assert register(other, "viewer@example.test", "badge_viewer", "+380670000444").status_code == 200
        uid = other.get("/api/me").json()["id"]
        url = f"/api/admin/users/{uid}/badges/verified"
        assert other.put(url, json={"enabled": True}).status_code == 403
        assert client.put(url, json={"enabled": True}).status_code == 200
        assert "verified" in other.get("/api/me").json()["badges"]
        assert client.put(url, json={"enabled": False}).status_code == 200
        assert "verified" not in other.get("/api/me").json()["badges"]
        colors = {"accent": "#C8102E", "background": "#0A0A0C",
                  "surface": "#16161A", "bubble": "#A5122B", "text": "#FFFFFF"}
        assert client.put("/api/admin/theme", json=colors).status_code == 200
        assert all(other.get("/api/public/config").json()["theme"][key] == value for key, value in colors.items())
        assert other.put("/api/admin/theme", json=colors).status_code == 403


def test_secure_session_survives_reopen_until_logout(app_client):
    client = app_client
    assert register(client, "user@example.test", "user_reopen", "+380670000555").status_code == 200
    sess = client.cookies.get("cloux_session")
    assert sess
    assert client.get("/api/me").status_code == 200
    assert client.get("/api/me").status_code == 200
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401
