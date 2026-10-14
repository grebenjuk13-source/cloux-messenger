"""Private file attachments for Cloux chats. Temporary storage on Render Free."""
import os
import time
import uuid
import mimetypes
from urllib.parse import urlparse
from fastapi import Request
from fastapi.responses import Response
from cloux_database import put_blob

MAX_SIZE=5*1024*1024
TYPES={
 "image/jpeg":(".jpg","image"),
 "image/png":(".png","image"),
 "image/webp":(".webp","image"),
 "image/gif":(".gif","image"),
 "audio/webm":(".webm","audio"),
 "audio/ogg":(".ogg","audio"),
 "audio/mpeg":(".mp3","audio"),
 "audio/mp4":(".m4a","audio"),
 "video/webm":(".webm","video"),
 "video/mp4":(".mp4","video"),
 "application/pdf":(".pdf","file")
}
def valid_magic(mime,content):
    if mime=="image/jpeg":return content.startswith(b"\xff\xd8\xff")
    if mime=="image/png":return content.startswith(b"\x89PNG\r\n\x1a\n")
    if mime=="image/webp":return content.startswith(b"RIFF") and content[8:12]==b"WEBP"
    if mime=="image/gif":return content[:6] in (b"GIF87a",b"GIF89a")
    if mime=="audio/ogg":return content.startswith(b"OggS")
    if mime=="audio/mpeg":return content.startswith(b"ID3") or content[:2] in (b"\xff\xfb",b"\xff\xf3",b"\xff\xf2")
    if mime in ("video/webm","audio/webm"):return content.startswith(b"\x1a\x45\xdf\xa3")
    if mime in ("video/mp4","audio/mp4"):return content[4:8]==b"ftyp"
    if mime=="application/pdf":return content.startswith(b"%PDF-")
    return False

def init(db):
    with db() as c:
        cols={x["name"] for x in c.execute("PRAGMA table_info(messages)").fetchall()}
        if "attachment_id" not in cols:
            c.execute("ALTER TABLE messages ADD COLUMN attachment_id TEXT")
        c.execute("""CREATE TABLE IF NOT EXISTS cloux_attachments(
         id TEXT PRIMARY KEY,
         chat_id TEXT NOT NULL REFERENCES chats(id),
         sender TEXT NOT NULL REFERENCES users(id),
         filename TEXT NOT NULL,
         mime TEXT NOT NULL,
         bytes INTEGER NOT NULL,
         created INTEGER NOT NULL)""")

def install(app,db,auth,member,fail,limit,storage_root):
    @app.post("/api/chats/{cid}/media")
    async def upload(cid:str, request:Request):
        user=auth(request)
        limit(request,25,60)
        origin=request.headers.get("origin")
        if origin and urlparse(origin).netloc.lower()!=request.headers.get("host","").lower():
            fail("Недійсне джерело запиту.",403)
        mime=request.headers.get("content-type","").split(";")[0].strip().lower()
        if mime not in TYPES:fail("Непідтримуваний формат файлу.",415)
        name=request.headers.get("x-cloux-filename","file")
        from urllib.parse import unquote
        name=unquote(name).replace("\\","/").split("/")[-1].strip()
        name="".join(ch for ch in name if ch.isprintable() and ch not in '<>:"|?*')
        name=name[:100] or "Вкладення"
        data=bytearray()
        async for part in request.stream():
            data.extend(part)
            if len(data)>MAX_SIZE:fail("Файл завеликий. Максимум 5 МБ.",413)
        if len(data)<12 or not valid_magic(mime,data):
            fail("Формат або вміст файлу не підтримується.",415)
        with db() as c:
            if not member(c,user["id"],cid):fail("Немає доступу до чату.",403)
            row=c.execute("SELECT kind FROM chats WHERE id=?",(cid,)).fetchone()
            if row and row["kind"]=="news":fail("Офіційні новини лише для читання.",403)
            if row and row["kind"]=="channel":
                owner=c.execute("SELECT owner_id FROM cloux_owners WHERE chat_id=?",(cid,)).fetchone()
                if not owner or owner["owner_id"]!=user["id"]:fail("Лише власник каналу може надсилати файли.",403)
            aid=str(uuid.uuid4())
            ext,cat=TYPES[mime]
            now=int(time.time())
            c.execute("INSERT INTO cloux_attachments(id,chat_id,sender,filename,mime,bytes,created) VALUES(?,?,?,?,?,?,?)",
              (aid,cid,user["id"],name,mime,len(data),now))
            put_blob(c,"chat-attachment/"+aid,mime,bytes(data),now)
            cur=c.execute("INSERT INTO messages(chat_id,sender,text,created,attachment_id) VALUES(?,?,?,?,?)",
              (cid,user["id"],"📎 "+name,now,aid))
        __import__("cloux_realtime").hub.emit(cid,"new_message",message_id=cur.lastrowid)
        return {"ok":True,"id":cur.lastrowid,"media_id":aid,"mime":mime,"bytes":len(data)}

    @app.get("/api/chats/{cid}/media/{aid}")
    def serve(cid:str,aid:str,request:Request):
        user=auth(request)
        with db() as c:
            if not member(c,user["id"],cid):fail("Немає доступу до файлу.",403)
            item=c.execute("""SELECT a.*,b.content FROM cloux_attachments a
              JOIN cloux_blobs b ON b.storage_key=?
              WHERE a.id=? AND a.chat_id=?""",("chat-attachment/"+aid,aid,cid)).fetchone()
        if not item:fail("Файл не знайдено.",404)
        mime=item["mime"]
        ext=TYPES[mime][0]
        disposition="inline" if mime.startswith(("image/","audio/","video/")) else "attachment"
        filename=item["filename"].replace('"',"").replace("\\","_")
        return Response(content=bytes(item["content"]),media_type=mime,
          headers={"Cache-Control":"private,no-store","X-Content-Type-Options":"nosniff",
                   "Content-Disposition":f'{disposition}; filename="cloux-file{ext}"'})
