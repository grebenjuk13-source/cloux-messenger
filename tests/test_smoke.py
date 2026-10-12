import os
import tempfile

os.environ["CLOUX_DATA"] = tempfile.mkdtemp(prefix="cloux-test-")
from main import app, requests_by_ip
from fastapi.testclient import TestClient
from tests.auth_helpers import create_account


def test_login_only_and_chat_notification_metadata():
    requests_by_ip.clear()
    with TestClient(app, base_url="https://testserver") as alice, TestClient(app, base_url="https://testserver") as bob:
        alice_id = create_account(alice, phone="+380670000011", username="user_one", display="Перший", password="SecureDev1!")
        create_account(bob, phone="+380670000012", username="user_two", display="Другий", password="SecureDev2!")

        assert alice.get("/api/me").status_code == 200
        for route in ("/api/register", "/api/v5/register", "/api/v6/register"):
            assert alice.post(route, json={}).status_code == 404

        login = alice.post("/api/login", json={"phone": "+380670000011", "password": "SecureDev1!"})
        assert login.status_code == 200, login.text

        bob_id = bob.get("/api/me").json()["id"]
        chat_id = alice.post("/api/direct/" + bob_id).json()["chat_id"]
        sent = alice.post(f"/api/chats/{chat_id}/messages", json={"text": "Cloux notification check"})
        assert sent.status_code == 200, sent.text

        chat = next(item for item in bob.get("/api/chats").json()["chats"] if item["id"] == chat_id)
        assert chat["last_message_id"] == sent.json()["id"]
        assert chat["last_sender"] == alice_id
        assert chat["last_text"] == "Cloux notification check"
