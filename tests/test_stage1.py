"""Regression checks for the public download page and simple account flow."""
import uuid

from fastapi.testclient import TestClient
from main import app


def _register(client, suffix):
    return client.post("/api/v6/register", json={
        "display": f"Cloux {suffix}", "username": f"cloux_{suffix}",
        "email": f"{suffix}@example.test", "phone": "+1555" + suffix[-7:],
        "password": "separate-cloux-password",
    })


def test_public_registration_login_and_mutual_follow_leaderboard():
    suffix = uuid.uuid4().hex[:12]
    with TestClient(app, base_url="https://testserver") as first:
        one = _register(first, suffix + "a")
        assert one.status_code == 200, one.text
        assert first.get("/api/me").status_code == 200
        second = TestClient(app, base_url="https://testserver")
        two = _register(second, suffix + "b")
        assert two.status_code == 200, two.text
        first_id = first.get("/api/me").json()["id"]
        second_id = second.get("/api/me").json()["id"]
        assert first.post(f"/api/users/{second_id}/follow").status_code == 200
        assert second.post(f"/api/users/{first_id}/follow").status_code == 200
        board = first.get("/api/friends/leaderboard")
        assert board.status_code == 200
        ranked = {u["id"]: u for u in board.json()["users"]}
        assert ranked[first_id]["friends"] == 1
        assert ranked[second_id]["friends"] == 1
        second.close()

    with TestClient(app, base_url="https://testserver") as login:
        response = login.post("/api/v6/login", json={"identifier": "+1555" + (suffix + "a")[-7:], "password": "separate-cloux-password"})
        assert response.status_code == 200
        assert login.get("/api/me").status_code == 200


def test_downloads_remain_public_and_signup_does_not_require_email_code():
    with TestClient(app, base_url="https://testserver") as client:
        response = client.get("/download")
        assert response.status_code == 200
        assert "Завантажити Android APK" in response.text
        assert "Завантажити Windows EXE" in response.text
        assert "Завантажити Mac DMG" in response.text
        wizard = (app.state.base_dir / "frontend" / "src" / "EmailWizard.tsx").read_text(encoding="utf-8") if hasattr(app.state, "base_dir") else None
        if wizard:
            assert "/api/v6/register" in wizard
            assert "Надіслати код" not in wizard
