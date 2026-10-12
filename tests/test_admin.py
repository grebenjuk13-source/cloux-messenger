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


def test_many_accounts_share_one_phone_but_keep_unique_identity_and_separate_sessions(app_client):
    client = app_client
    first = register(client, "one@example.test", "cloux_one", "+380670019999")
    assert first.status_code == 200, first.text
    first_id = client.get("/api/me").json()["id"]
    assert client.post("/api/logout").status_code == 200

    # Different email, username, and password; same real phone.
    second = client.post("/api/v6/register", json={
        "email": "two@example.test", "phone": "+380670019999",
        "username": "cloux_two", "display": "Другий",
        "password": "DifferentSafeTestPass#12345",
    })
    assert second.status_code == 200, second.text
    second_id = client.get("/api/me").json()["id"]
    assert second_id != first_id
    assert client.post("/api/logout").status_code == 200

    # Login by phone chooses only the account whose password actually matches.
    for pwd, uid in (("SafeTestPass#12345", first_id),
                     ("DifferentSafeTestPass#12345", second_id)):
        res = client.post("/api/v6/login", json={
            "identifier": "+380670019999", "password": pwd})
        assert res.status_code == 200, res.text
        assert client.get("/api/me").json()["id"] == uid
        assert client.post("/api/logout").status_code == 200

    # The legacy phone login must also choose the correct account.
    old_login = client.post("/api/login", json={
        "phone": "+380670019999", "password": "SafeTestPass#12345"})
    assert old_login.status_code == 200, old_login.text
    assert client.get("/api/me").json()["id"] == first_id
    client.post("/api/logout")

    # The phone may repeat, but username/email must not collide.
    dup_email = client.post("/api/v6/register", json={
        "email": "one@example.test", "phone": "+380670019999",
        "username": "cloux_three", "display": "Третій",
        "password": "ThirdSafeTestPass#12345"})
    assert dup_email.status_code == 400
    dup_name = client.post("/api/v6/register", json={
        "email": "three@example.test", "phone": "+380670019999",
        "username": "cloux_one", "display": "Третій",
        "password": "ThirdSafeTestPass#12345"})
    assert dup_name.status_code == 400

    # Equal passwords are ambiguous: require a unique login identifier.
    with main.db() as conn:
        conn.execute("UPDATE users SET password_hash=? WHERE id=?",
                     (main.hash_password("SafeTestPass#12345"), second_id))
    ambiguous = client.post("/api/v6/login", json={
        "identifier": "+380670019999", "password": "SafeTestPass#12345"})
    assert ambiguous.status_code == 409
    by_name = client.post("/api/v6/login", json={
        "identifier": "@cloux_two", "password": "SafeTestPass#12345"})
    assert by_name.status_code == 200
    assert client.get("/api/me").json()["id"] == second_id


def test_migrate_old_phone_unique_index_without_losing_chats(tmp_path):
    import sqlite3
    from cloux_multiaccounts import migrate_sqlite
    path = tmp_path / "old_cloux.sqlite"
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript("""
        CREATE TABLE users(id TEXT PRIMARY KEY,phone TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,display TEXT NOT NULL,
            password_hash TEXT NOT NULL,created INTEGER NOT NULL,email TEXT);
        CREATE UNIQUE INDEX users_email_unique_idx ON users(email COLLATE NOCASE)
            WHERE email IS NOT NULL AND email<>'';
        CREATE TABLE chats(id TEXT PRIMARY KEY,title TEXT);
        CREATE TABLE messages(id INTEGER PRIMARY KEY, sender TEXT NOT NULL REFERENCES users(id),
            chat_id TEXT NOT NULL REFERENCES chats(id));
        INSERT INTO users VALUES('old','+380670019999','old_user','Original','old-hash',111,'old@example.test');
        INSERT INTO chats VALUES('lobby','Before migration');
        INSERT INTO messages VALUES(1,'old','lobby');
        """)
    migrate_sqlite(path)
    migrate_sqlite(path)  # Idempotent on subsequent server starts.
    with sqlite3.connect(path) as conn:
        conn.execute("PRAGMA foreign_keys=ON")
        assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
        assert conn.execute("SELECT sender FROM messages WHERE id=1").fetchone()[0] == "old"
        conn.execute("""INSERT INTO users VALUES(
            'new','+380670019999','new_user','New','other-hash',222,'new@example.test')""")
        assert conn.execute("SELECT COUNT(*) FROM users WHERE phone='+380670019999'").fetchone()[0] == 2
