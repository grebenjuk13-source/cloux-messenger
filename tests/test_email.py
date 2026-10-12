"""Existing-account email login tests; no verification-code or public registration flow."""
import os
import tempfile
import uuid

os.environ["CLOUX_DATA"] = os.getenv("CLOUX_DATA", tempfile.mkdtemp(prefix="cloux_email_test_"))
from fastapi.testclient import TestClient
from main import app, requests_by_ip
from tests.auth_helpers import create_account


def test_existing_account_email_login_and_no_registration():
    requests_by_ip.clear()
    email = "cloux.login.test+" + uuid.uuid4().hex[:8] + "@gmail.com"
    password = "Cloux^Password298"
    with TestClient(app, base_url="https://testserver") as client:
        create_account(client, phone="+380679990011", username="email_login_test", display="Email Test", password=password, email=email)
        client.cookies.clear()

        result = client.post("/api/v6/login", json={"email": email, "password": password})
        assert result.status_code == 200, result.text
        assert client.get("/api/me").status_code == 200
        assert client.post("/api/v6/register", json={}).status_code == 404
        assert client.post("/api/v6/email/send", json={"email": email}).status_code == 404
