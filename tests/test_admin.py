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


def test_owner_public_chat_role_and_privacy(app_client, monkeypatch):
    owner=app_client
    assert register(owner,"verified-admin@example.test","owner_public","+380670000666").status_code==200
    codes=[]
    monkeypatch.setattr(cloux_admin,"send_code",lambda address,code: codes.append(code))
    assert owner.post("/api/account/verify-email/send").status_code==200
    assert owner.post("/api/account/verify-email/confirm",json={"code":codes[-1]}).status_code==200
    with TestClient(main.app,base_url=HOST) as member:
        assert register(member,"member@example.test","community_user","+380670000777").status_code==200
        member_id=member.get("/api/me").json()["id"]
        assert member.get("/api/admin/chats").status_code==403
        assert owner.put(f"/api/admin/users/{member_id}/role",json={"role":"moderator"}).status_code==200
        assert member.get("/api/admin/overview").status_code==403
        assert owner.put(f"/api/admin/users/{member_id}/role",json={"role":"owner"}).status_code==422
        new_chat=owner.post("/api/admin/chats",json={
            "title":"Команда Cloux","kind":"channel","description":"Офіційна спільнота"
        })
        assert new_chat.status_code==200,new_chat.text
        channel_id=new_chat.json()["chat_id"]
        assert owner.patch(f"/api/admin/chats/{channel_id}",json={
            "title":"Наш канал","description":"Новини команди"
        }).status_code==200
        assert any(ch["title"]=="Наш канал" for ch in owner.get("/api/admin/chats").json()["chats"])
        owner_uid=owner.get("/api/me").json()["id"]
        private=member.post(f"/api/direct/{owner_uid}").json()["chat_id"]
        assert all(ch["id"]!=private for ch in owner.get("/api/admin/chats").json()["chats"])
        assert owner.patch(f"/api/admin/chats/{private}",json={
            "title":"Hidden chat","description":""
        }).status_code==403
        assert owner.delete(f"/api/admin/chats/{private}/messages/1").status_code==403
        report=member.post("/api/reports",json={
            "subject_id":private,"category":"direct",
            "reason":"Private conversation should be reviewed"
        })
        assert report.status_code==200,report.text
        rows=owner.get("/api/admin/reports").json()["reports"]
        assert rows and "Private conversation" not in rows[0]["reason"]
        assert owner.put(f"/api/admin/reports/{rows[0]['id']}",
                         json={"status":"resolved"}).status_code==200


def test_v6_login_preserves_existing_accounts_using_both_hash_formats(app_client):
    """The same login UI must accept historical PBKDF2 accounts and new Argon2."""
    client = app_client
    created = register(client, "legacy@example.test", "existing_person", "+380670090001")
    assert created.status_code == 200, created.text
    uid = client.get("/api/me").json()["id"]
    assert client.post("/api/logout").status_code == 200

    # Accounts created in the new app must keep working via email and nickname.
    for identifier in ("legacy@example.test", "@existing_person"):
        response = client.post("/api/v6/login", json={
            "identifier": identifier, "password": "SafeTestPass#12345"})
        assert response.status_code == 200, response.text
        assert client.get("/api/me").json()["id"] == uid
        assert client.post("/api/logout").status_code == 200

    # Simulate the existing on-disk account migrated from the earlier Cloux.
    legacy_hash = main.hash_password("OldAccountPass#42")
    with main.db() as conn:
        conn.execute("UPDATE users SET password_hash=? WHERE id=?", (legacy_hash, uid))
    for identifier in ("legacy@example.test", "+380670090001", "existing_person"):
        response = client.post("/api/v6/login", json={
            "identifier": identifier, "password": "OldAccountPass#42"})
        assert response.status_code == 200, response.text
        assert client.get("/api/me").json()["id"] == uid
        assert client.post("/api/logout").status_code == 200

    wrong = client.post("/api/v6/login", json={
        "identifier": "legacy@example.test", "password": "IncorrectPassword"})
    assert wrong.status_code == 401
    with main.db() as conn:
        stored = conn.execute("SELECT password_hash FROM users WHERE id=?", (uid,)).fetchone()
    assert stored["password_hash"] == legacy_hash

    # Some truly old accounts were created before email addresses were stored.
    import time
    with main.db() as conn:
        conn.execute("""INSERT INTO users
            (id,phone,username,display,password_hash,created,email)
            VALUES(?,?,?,?,?,?,?)""",
            ("legacy_without_mail", "+380670090002", "older_cloux", "Older",
             main.hash_password("OldWithoutEmail#43"), int(time.time()), None))
    for identifier in ("+380670090002", "@older_cloux"):
        response = client.post("/api/v6/login", json={
            "identifier": identifier, "password": "OldWithoutEmail#43"})
        assert response.status_code == 200, response.text
        assert client.get("/api/me").json()["id"] == "legacy_without_mail"
        assert client.post("/api/logout").status_code == 200
