"""Regression checks for public downloads and removing account creation/code flows."""
from fastapi.testclient import TestClient
from main import app, BASE


def test_registration_routes_are_gone_and_downloads_are_public():
    with TestClient(app, base_url="https://testserver") as client:
        for route in ("/api/register", "/api/v5/register", "/api/v6/register", "/api/v5/sms/send", "/api/v5/sms/check", "/api/v6/email/send"):
            assert client.post(route, json={}).status_code == 404

        download = client.get("/download")
        assert download.status_code == 200
        assert "Завантаження без акаунта" in download.text
        assert "Завантажити Windows EXE" in download.text
        assert "Завантажити Android APK" in download.text
        assert "Завантажити Mac DMG" in download.text
        assert "iPhone та iPad" in download.text
        assert "Створити акаунт" not in download.text
        assert "Увійти до Cloux" not in download.text

    legacy_ui = (BASE / "ui" / "app.js").read_text(encoding="utf-8")
    assert "/api/register" not in legacy_ui
    assert "Зареєструватися" not in legacy_ui
    assert "Створити акаунт" not in legacy_ui

    modern_login = (BASE / "frontend" / "src" / "EmailWizard.tsx").read_text(encoding="utf-8")
    assert "/api/v6/register" not in modern_login
    assert "Надіслати код" not in modern_login
