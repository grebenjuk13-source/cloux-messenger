"""Cloux websocket chat events. Single-process event hub; DB remains source of truth.

This is NOT durable inter-instance message delivery; production needs Redis pub/sub.
All users are authenticated from the existing HttpOnly cookie and chat membership.
"""
import asyncio
import hashlib
import json
import time
from collections import defaultdict
from urllib.parse import urlsplit
from fastapi import WebSocket, WebSocketDisconnect

class ChatHub:
    def __init__(self):
        self.rooms = defaultdict(dict)  # chat_id -> connection_id -> bounded queue
        self.loop = None
        self.next_id = 0

    def emit(self, chat_id, kind, **payload):
        event = {"type": kind, "chat_id": chat_id, **payload}
        loop = self.loop
        if not loop or loop.is_closed():
            return
        def publish():
            for q in list(self.rooms.get(chat_id, {}).values()):
                if q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    pass
        loop.call_soon_threadsafe(publish)

hub = ChatHub()

def install(app, db):
    @app.on_event("startup")
    async def capture_loop():
        hub.loop = asyncio.get_running_loop()

    @app.websocket("/ws/chats/{chat_id}")
    async def chat_ws(ws: WebSocket, chat_id: str):
        token = ws.cookies.get("cloux_session", "")
        origin = ws.headers.get("origin", "")
        host = ws.headers.get("host", "").lower()
        if not token or (origin and urlsplit(origin).netloc.lower() != host):
            await ws.close(code=1008)
            return
        digest = hashlib.sha256(token.encode()).hexdigest()
        with db() as c:
            who = c.execute("""SELECT u.id FROM sessions s JOIN users u ON s.uid=u.id
               JOIN chat_members m ON m.user_id=u.id
               WHERE s.token=? AND s.expires>? AND m.chat_id=?""",
               (digest,int(time.time()),chat_id)).fetchone()
        if not who:
            await ws.close(code=1008)
            return
        uid = who["id"]
        await ws.accept()
        hub.loop = asyncio.get_running_loop()
        hub.next_id += 1
        conn_id = hub.next_id
        q = asyncio.Queue(maxsize=60)
        hub.rooms[chat_id][conn_id] = q
        await ws.send_json({"type":"connected","chat_id":chat_id})
        sender = None
        async def forward():
            try:
                while True:
                    await ws.send_json(await q.get())
            except (WebSocketDisconnect, RuntimeError):
                return
        sender = asyncio.create_task(forward())
        last_typing = 0
        try:
            while True:
                data = await ws.receive_text()
                if len(data) > 1024:
                    await ws.close(code=1009)
                    break
                try:
                    message = json.loads(data)
                except (ValueError, TypeError):
                    continue
                if not isinstance(message, dict):
                    continue
                if message.get("type") == "ping":
                    await ws.send_json({"type":"pong"})
                elif message.get("type") == "typing":
                    now = time.monotonic()
                    if now - last_typing < 1.25:
                        continue
                    last_typing = now
                    # Never trust a sender id supplied by the client.
                    event = {"type":"typing","chat_id":chat_id,
                             "user_id":uid,"active":bool(message.get("active"))}
                    for cid,other in list(hub.rooms[chat_id].items()):
                        if cid != conn_id and not other.full():
                            other.put_nowait(event)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            hub.rooms.get(chat_id, {}).pop(conn_id, None)
            if not hub.rooms.get(chat_id):
                hub.rooms.pop(chat_id, None)
            if sender:
                sender.cancel()
                try:
                    await sender
                except (asyncio.CancelledError, RuntimeError):
                    pass
