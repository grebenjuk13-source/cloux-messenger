import os
import tempfile

os.environ["CLOUX_DATA"] = tempfile.mkdtemp(prefix="cloux-test-")
from main import app
from fastapi.testclient import TestClient

def test_registration_notes_news_preferences_direct_and_signaling():
    with TestClient(app, base_url="https://testserver") as a, TestClient(app, base_url="https://testserver") as b:
        r=a.post("/api/register",json={"phone":"+380670000011","username":"user_one","display":"Перший","password":"SecureDev1!"})
        assert r.status_code==200,r.text
        r=b.post("/api/register",json={"phone":"+380670000012","username":"user_two","display":"Другий","password":"SecureDev2!"})
        assert r.status_code==200,r.text
        me=a.get("/api/me")
        assert me.status_code==200
        assert int(a.cookies["cloux_session"] != "")==1
        assert a.get("/api/preferences").json()["preferences"]["glass"]==1
        prefs=a.patch("/api/preferences",json={"glass":False,"bubble_style":"square"})
        assert prefs.status_code==200,prefs.text
        assert prefs.json()["preferences"]["bubble_style"]=="square"
        chats=a.get("/api/chats").json()["chats"]
        assert any(x["kind"]=="saved" for x in chats)
        news=next(x for x in chats if x["kind"]=="news")
        assert a.post(f"/api/chats/{news['id']}/messages",json={"text":"hijack"}).status_code==403
        user2=b.get("/api/me").json()
        cid=a.post("/api/direct/"+user2["id"]).json()["chat_id"]
        assert a.post(f"/api/chats/{cid}/messages",json={"text":"Тест: привіт!"}).status_code==200
        got=b.get(f"/api/chats/{cid}/messages").json()["messages"]
        assert got[-1]["text"]=="Тест: привіт!"

        mid=got[-1]["id"]
        assert b.post(f"/api/chats/{cid}/reply/{mid}",json={"text":"Відповідаю!"}).status_code==200
        latest=a.get(f"/api/chats/{cid}/messages").json()["messages"][-1]
        assert latest["reply_to"]==mid
        assert latest["reply_text"]=="Тест: привіт!"
        found=a.get("/api/messages/search?q="+__import__("urllib.parse",fromlist=["quote"]).quote("привіт")).json()["messages"]
        assert any(x["id"]==mid for x in found)
        saved=next(x for x in chats if x["kind"]=="saved")
        sent=a.post(f"/api/chats/{cid}/forward/{mid}",json={"target_chat_id":saved["id"]})
        assert sent.status_code==200,sent.text
        copied=a.get(f"/api/chats/{saved['id']}/messages").json()["messages"][-1]
        assert copied["forwarded_from"]=="user_one"
        assert copied["text"]=="Тест: привіт!"

        png=b"\x89PNG\r\n\x1a\n"+b"00"+"image"
        bad=a.post(f"/api/chats/{cid}/media",content=b"<script>alert(1)</script>",headers={"content-type":"text/html"})
        assert bad.status_code==415
        sent_file=a.post(f"/api/chats/{cid}/media",content=png,headers={"content-type":"image/png","x-cloux-filename":"sample.png"})
        assert sent_file.status_code==200,sent_file.text
        media_id=sent_file.json()["media_id"]
        viewed=b.get(f"/api/chats/{cid}/media/{media_id}")
        assert viewed.status_code==200
        assert viewed.content==png
        assert viewed.headers["content-type"].startswith("image/png")
        messages=b.get(f"/api/chats/{cid}/messages").json()["messages"]
        assert messages[-1]["attachment_id"]==media_id
        assert messages[-1]["media_mime"]=="image/png"


        invite=a.post("/api/channels",json={"title":"Наш тестовий канал"})
        assert invite.status_code==200
        ch=invite.json()["chat_id"]
        link=a.post(f"/api/chats/{ch}/invite").json()["code"]
        assert b.post(f"/api/invites/{link}/join").status_code==200
        assert b.post(f"/api/chats/{ch}/messages",json={"text":"oops"}).status_code==403
        headers_a={"cookie":"cloux_session="+a.cookies.get("cloux_session"),"origin":"https://testserver"}
        headers_b={"cookie":"cloux_session="+b.cookies.get("cloux_session"),"origin":"https://testserver"}
        with a.websocket_connect(f"/ws/calls/{cid}",headers=headers_a) as ca:
            assert ca.receive_json()["type"]=="ready"
            with b.websocket_connect(f"/ws/calls/{cid}",headers=headers_b) as cb:
                assert cb.receive_json()["type"]=="ready"
                assert ca.receive_json()["type"]=="peer-joined"
                ca.send_json({"type":"offer","sdp":{"type":"offer","sdp":"v=0\\r\\n"}})
                msg=cb.receive_json()
                assert msg["type"]=="offer"
                assert msg["sdp"]["type"]=="offer"
