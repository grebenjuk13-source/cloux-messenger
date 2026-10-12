"""Legacy mail-code routes remain removed after signup was disabled."""
from fastapi.testclient import TestClient
from main import app


def test_no_code_or_mail_registration_endpoints():
    with TestClient(app, base_url="https://testserver") as client:
        assert client.post("/api/v6/email/send", json={"email": "user@example.com"}).status_code == 404
        assert client.post("/api/v6/email/check", json={"email": "user@example.com", "code": "123456"}).status_code == 404
        assert client.post("/api/v6/register", json={}).status_code == 404
        assert client.get("/oauth/resend/client").status_code == 404
        assert client.get("/admin/mail").status_code == 404
