"""Authenticated, single-process WebRTC signaling for one-to-one Cloux calls.

Media flows peer-to-peer through WebRTC, not through this server.
A public TURN server is required for reliable calls behind restrictive networks.
"""
import hashlib
import os
import json
import time
from urllib.parse import urlparse
from fastapi import WebSocket, WebSocketDisconnect

rooms = {}

def install(app, db):
    @app.get("/api/v6/ice")
    def ice_config():
        servers=[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]
        turn=os.getenv("TURN_URL","").strip()
        username=os.getenv("TURN_USERNAME","").strip()
        password=os.getenv("TURN_PASSWORD","")
        if turn and username and password:
            if turn.startswith(("turn:","turns:")):
                servers.append({"urls":turn,"username":username,"credential":password})
        return {"iceServers":servers}

    @app.websocket("/ws/calls/{chat_id}")
    async def signaling(ws: WebSocket, chat_id: str):
        token = ws.cookies.get("cloux_session")
        origin = ws.headers.get("origin", "")
        host = ws.headers.get("host", "")
        if origin and urlparse(origin).netloc.lower() != host.lower():
            await ws.close(code=1008)
            return
        if not token:
            await ws.close(code=1008)
            return
        with db() as c:
            user = c.execute("""SELECT u.id FROM sessions s
                JOIN users u ON u.id=s.uid WHERE s.token=? AND s.expires>?""",
                (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
            kind = c.execute("SELECT kind FROM chats WHERE id=?", (chat_id,)).fetchone()
            valid = bool(user and kind and kind["kind"]=="direct" and c.execute(
                "SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?",
                (chat_id,user["id"])).fetchone())
        if not valid:
            await ws.close(code=1008)
            return
        uid = user["id"]
        room = rooms.setdefault(chat_id, {})
        if uid in room or len(room) >= 2:
            await ws.close(code=1008)
            return
        await ws.accept()
        room[uid] = ws
        await ws.send_json({"type":"ready", "peers":len(room)-1})
        for other_uid, peer in list(room.items()):
            if other_uid != uid:
                try:
                    await peer.send_json({"type":"peer-joined"})
                except Exception:
                    pass
        try:
            while True:
                data = await ws.receive_json()
                if not isinstance(data, dict) or data.get("type") not in ("offer","answer","ice","hangup"):
                    continue
                if len(json.dumps(data,ensure_ascii=False)) > 32768:
                    await ws.close(code=1009)
                    break
                event = {"type":data["type"]}
                if data["type"] in ("offer","answer"):
                    if not isinstance(data.get("sdp"), dict):
                        continue
                    event["sdp"] = data["sdp"]
                if data["type"] == "ice":
                    if not isinstance(data.get("candidate"), dict):
                        continue
                    event["candidate"] = data["candidate"]
                for other_uid, peer in list(room.items()):
                    if other_uid != uid:
                        try:
                            await peer.send_json(event)
                        except Exception:
                            pass
                if data["type"] == "hangup":
                    break
        except (WebSocketDisconnect, ValueError, RuntimeError):
            pass
        finally:
            if room.get(uid) is ws:
                room.pop(uid,None)
            for peer in list(room.values()):
                try:
                    await peer.send_json({"type":"peer-left"})
                except Exception:
                    pass
            if not room:
                rooms.pop(chat_id,None)
