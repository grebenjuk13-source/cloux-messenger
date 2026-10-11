"""Cloux chat upgrades: replies, forwarding, and searchable message history."""
from fastapi import Request
from pydantic import BaseModel, Field
from typing import Optional
import time

class ReplyBody(BaseModel):
    text: str = Field(min_length=1, max_length=4000)

class ForwardBody(BaseModel):
    target_chat_id: str = Field(min_length=1,max_length=100)

def init(db):
    with db() as c:
        current = {row["name"] for row in c.execute("PRAGMA table_info(messages)").fetchall()}
        if "reply_to" not in current:
            c.execute("ALTER TABLE messages ADD COLUMN reply_to INTEGER")
        if "forwarded_from" not in current:
            c.execute("ALTER TABLE messages ADD COLUMN forwarded_from TEXT")

def install(app, db, auth, member, fail, limit):
    def can_send(c, uid, cid):
        if not member(c, uid, cid):
            fail("Немає доступу до чату.",403)
        row=c.execute("SELECT kind FROM chats WHERE id=?",(cid,)).fetchone()
        if not row: fail("Чату не знайдено.",404)
        if row["kind"]=="news":
            fail("У новини Cloux не можна надсилати повідомлення.",403)
        if row["kind"]=="channel":
            owner=c.execute("SELECT owner_id FROM cloux_owners WHERE chat_id=?",(cid,)).fetchone()
            if not owner or owner["owner_id"]!=uid:
                fail("Лише власник каналу може писати в нього.",403)

    @app.get("/api/messages/search")
    def search_messages(request:Request, q: str=""):
        user=auth(request)
        query=q.strip()
        if len(query)<2: return {"messages":[]}
        if len(query)>80: fail("Запит надто довгий.")
        with db() as c:
            # Escape wildcard characters so user search is literal.
            needle="%"+query.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%"
            rows=c.execute("""SELECT m.id,m.chat_id,m.text,m.created,m.sender,
              c.title as chat_title,u.display as sender_name
              FROM messages m
              JOIN chat_members cm ON cm.chat_id=m.chat_id AND cm.user_id=?
              JOIN chats c ON c.id=m.chat_id
              JOIN users u ON u.id=m.sender
              WHERE m.text LIKE ? ESCAPE '\\'
              ORDER BY m.id DESC LIMIT 40""",(user["id"],needle)).fetchall()
        return {"messages":[dict(x) for x in rows]}

    @app.post("/api/chats/{cid}/reply/{mid}")
    def reply(cid:str,mid:int, data:ReplyBody, request:Request):
        user=auth(request)
        limit(request,120)
        text=data.text.strip()
        if not text: fail("Порожнє повідомлення.")
        with db() as c:
            can_send(c,user["id"],cid)
            original=c.execute("SELECT id FROM messages WHERE id=? AND chat_id=?",(mid,cid)).fetchone()
            if not original: fail("Повідомлення не знайдено в цьому чаті.",404)
            cursor=c.execute("INSERT INTO messages(chat_id,sender,text,created,reply_to) VALUES(?,?,?,?,?)",
                    (cid,user["id"],text,int(time.time()),mid))
        return {"id":cursor.lastrowid,"ok":True}

    @app.post("/api/chats/{cid}/forward/{mid}")
    def forward(cid:str,mid:int,data:ForwardBody,request:Request):
        user=auth(request)
        limit(request,80)
        with db() as c:
            if not member(c,user["id"],cid):fail("Немає доступу до вихідного чату.",403)
            row=c.execute("SELECT m.text,m.chat_id,u.username FROM messages m JOIN users u ON u.id=m.sender WHERE m.id=? AND m.chat_id=?",(mid,cid)).fetchone()
            if not row: fail("Повідомлення не знайдено.",404)
            can_send(c,user["id"],data.target_chat_id)
            cursor=c.execute("INSERT INTO messages(chat_id,sender,text,created,forwarded_from) VALUES(?,?,?,?,?)",
                    (data.target_chat_id,user["id"],row["text"],int(time.time()),row["username"]))
        return {"id":cursor.lastrowid,"ok":True}
