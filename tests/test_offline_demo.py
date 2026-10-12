"""Security and packaging smoke checks for the standalone offline Cloux demo."""
from pathlib import Path
from fastapi.testclient import TestClient
from main import app, BASE


def test_standalone_html_is_self_contained():
    path = BASE / "offline" / "index.html"
    markup = path.read_text(encoding="utf-8")
    assert markup.startswith("<!DOCTYPE html>")
    assert markup.count("<script>") == 1
    assert "<link rel=" not in markup.lower()
    assert "<script src=" not in markup.lower()
    assert "default-src 'none'" in markup
    assert "PBKDF2" in markup
    assert "SHA-256" in markup
    assert "AES-GCM" in markup
    assert "iterations:300000" in markup
    assert "innerHTML" not in markup
    assert "localStorage" in markup
    assert "prefers-reduced-motion" in markup
    assert "100dvh" in markup
    assert "Це офлайн-демо без сервера" in markup


def test_offline_demo_route():
    with TestClient(app) as client:
        for route in ("/offline", "/offline/"):
            response = client.get(route)
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/html")
            assert response.headers["cache-control"] == "no-store"
            assert "Cloux" in response.text
