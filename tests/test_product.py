"""Live Cloux product API contract: privacy, friendship, wallpapers and backups."""
import uuid
from fastapi.testclient import TestClient
from main import app,requests_by_ip
from tests.auth_helpers import create_account


def account(client,n):
    suffix=uuid.uuid4().hex[:11]
    return create_account(client,phone="+38067"+str(uuid.uuid4().int%10000000).zfill(7),
                          username="cx"+suffix,display=n,password="ClouxTest234!")


def test_friend_requests_private_lists_and_profile_style():
    requests_by_ip.clear()
    with TestClient(app,base_url="https://testserver") as first:
        a=account(first,"Альфа")
        with TestClient(app,base_url="https://testserver") as second:
            b=account(second,"Бета")
            assert first.get("/api/cloux/profile/"+b).json()["profile"]["friendship"]=="none"
            response=first.post("/api/cloux/friends/"+b+"/request")
            assert response.status_code==200,response.text
            assert second.get("/api/cloux/profile/"+a).json()["profile"]["friendship"]=="incoming"
            requests=second.get("/api/cloux/friend-requests").json()
            assert len(requests["incoming"])>=1
            assert second.post("/api/cloux/friends/"+a+"/accept").status_code==200
            assert first.get("/api/cloux/profile/"+b).json()["profile"]["friendship"]=="friend"
            listed=first.get("/api/cloux/friends/"+a).json()["friends"]
            assert b in [x["id"] for x in listed]
            pref=second.get("/api/cloux/settings").json()["settings"]
            pref["friends_visibility"]="none"
            response=second.put("/api/cloux/settings",json=pref)
            assert response.status_code==200,response.text
            assert first.get("/api/cloux/friends/"+b).status_code==403
            assert second.get("/api/cloux/friends/"+b).status_code==200
            style=second.patch("/api/cloux/profile/style",json={
                "profile_accent":"#FF0033","banner_gradient":"linear-gradient(120deg,#220011,#050505)","status_icon":"☄️"})
            assert style.status_code==200,style.text
            other=first.get("/api/cloux/profile/"+b).json()["profile"]
            assert other["accent"]=="#FF0033"
            assert second.delete("/api/cloux/friends/"+a).status_code==200
            assert first.get("/api/cloux/profile/"+b).json()["profile"]["friendship"]=="none"


def test_scoped_wallpaper_backup_and_restore():
    requests_by_ip.clear()
    with TestClient(app,base_url="https://testserver") as client:
        uid=account(client,"Гамма")
        chats=client.get("/api/chats").json()["chats"]
        chat=next(x["id"] for x in chats if x["kind"]=="saved")
        sent=client.post("/api/chats/"+chat+"/messages",json={"text":"Тестове відновлене повідомлення"})
        assert sent.status_code==200,sent.text
        wall={"kind":"gradient","preset":"w0","colors":["#AA0011","#000000"],"angle":220,
              "pattern":"stars","intensity":38,"blur":4,"dim":18,"animate":True,"parallax":True}
        response=client.put("/api/cloux/wallpaper?scope="+chat+"&mode=dark",json=wall)
        assert response.status_code==200,response.text
        own=client.get("/api/cloux/wallpaper?scope="+chat+"&mode=dark").json()["wallpaper"]
        assert own["pattern"]=="stars"
        assert client.get("/api/cloux/wallpaper?scope="+chat+"&mode=light").json()["wallpaper"] is None
        created=client.post("/api/cloux/backups")
        assert created.status_code==200,created.text
        entry=client.get("/api/cloux/backups").json()["backups"][0]
        original=client.get("/api/cloux/backups/"+str(entry["id"])).json()
        assert original["format"]=="cloux-backup-2"
        assert original["account"]["id"]==uid
        assert client.delete("/api/cloux/wallpaper?scope="+chat+"&mode=dark").status_code==200
        imported=client.post("/api/cloux/backups/restore",json={"data":original})
        assert imported.status_code==200,imported.text
        assert imported.json()["wallpapers_restored"]>=1
        assert imported.json()["messages_restored"]>=1
        archive=client.get("/api/cloux/backups/archive/list")
        assert archive.status_code==200,archive.text
        assert any(x["id"]==chat for x in archive.json()["chats"])
        items=client.get("/api/cloux/backups/archive/chat/"+chat).json()["messages"]
        assert any("Тестове відновлене" in x["text"] for x in items)
        assert client.get("/api/cloux/wallpaper?scope="+chat+"&mode=dark").json()["wallpaper"]["pattern"]=="stars"
        assert client.delete("/api/cloux/backups/"+str(entry["id"])).status_code==200
