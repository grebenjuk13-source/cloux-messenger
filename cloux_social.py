"""Cloux profile media, reactions, read receipts, servers and presence.

Access is checked server-side. Media on Render Free is still ephemeral.
"""
from __future__ import annotations
import io
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from fastapi import Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError

DEFAULT_AVATAR = '/assets/cloux-default-avatar.jpg'
ALLOWED_REACTIONS = {'❤️','👍','😂','🔥','🎉','😮','😢','👏','🤝','⭐','💯','👀','🤍','😁','👎'}

class Mood(BaseModel):
    status: str = Field(default='', max_length=90)

class RoleUpdate(BaseModel):
    role: str

class ServerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=55)
    description: str = Field(default='', max_length=180)

class ChannelCreate(BaseModel):
    name: str = Field(min_length=2, max_length=55)

class ReactionPayload(BaseModel):
    emoji: str = Field(min_length=1, max_length=12)

class ThemePayload(BaseModel):
    theme: str = 'dark'
    accent: str = '#F5F5F5'
    wallpaper_blur: int = 0
    wallpaper_dim: int = 12


def init(db):
    with db() as c:
        columns={x['name'] for x in c.execute('PRAGMA table_info(cloux_preferences)').fetchall()}
        for col,typ in [
            ('status', "TEXT NOT NULL DEFAULT ''"),
            ('theme', "TEXT NOT NULL DEFAULT 'dark'"),
            ('wallpaper_blur', 'INTEGER NOT NULL DEFAULT 0'),
            ('wallpaper_dim', 'INTEGER NOT NULL DEFAULT 12'),
            ('photo_version', 'INTEGER NOT NULL DEFAULT 0')
        ]:
            if col not in columns: c.execute(f'ALTER TABLE cloux_preferences ADD COLUMN {col} {typ}')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS cloux_reactions (
          message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          uid TEXT NOT NULL REFERENCES users(id), emoji TEXT NOT NULL,
          PRIMARY KEY(message_id,uid,emoji));
        CREATE TABLE IF NOT EXISTS cloux_reads (
          chat_id TEXT NOT NULL REFERENCES chats(id),
          uid TEXT NOT NULL REFERENCES users(id), last_id INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(chat_id,uid));
        CREATE TABLE IF NOT EXISTS cloux_presence (
          uid TEXT PRIMARY KEY REFERENCES users(id), seen INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_servers (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
          owner_id TEXT NOT NULL REFERENCES users(id), created INTEGER NOT NULL,
          invite_code TEXT UNIQUE NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_server_members (
          server_id TEXT NOT NULL REFERENCES cloux_servers(id),
          uid TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL DEFAULT 'member',
          PRIMARY KEY(server_id,uid));
        CREATE TABLE IF NOT EXISTS cloux_server_channels (
          server_id TEXT NOT NULL REFERENCES cloux_servers(id),
          chat_id TEXT NOT NULL REFERENCES chats(id), sort_order INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY(server_id,chat_id));
        ''')


def install(app,db,auth,member,fail,limit,data_dir,base_dir):
    media_dir=Path(data_dir)/'profile-media'
    media_dir.mkdir(parents=True,exist_ok=True)

    def server_role(c,sid,uid):
        row=c.execute('SELECT role FROM cloux_server_members WHERE server_id=? AND uid=?',(sid,uid)).fetchone()
        return row['role'] if row else None

    @app.get('/assets/cloux-default-avatar.jpg')
    def default_avatar():
        # Original user-supplied bytes. CSS circle clipping does not alter the image.
        return FileResponse(Path(base_dir)/'assets'/'cloux-default-avatar.jpg',media_type='image/jpeg')

    @app.get('/api/profile/{uid}/media/{kind}')
    def profile_image(uid:str,kind:str,request:Request):
        auth(request)
        if kind not in ('avatar','banner','wallpaper'):fail('Неправильний тип зображення.',404)
        with db() as c:
            if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('Користувача не знайдено.',404)
        if kind=='wallpaper' and uid != auth(request)['id']:fail('Приватні шпалери.',403)
        file=media_dir/f'{uid}-{kind}.webp'
        if not file.is_file():fail('Фото не встановлено.',404)
        return FileResponse(file,media_type='image/webp',headers={'Cache-Control':'private,no-store'})

    @app.post('/api/profile/media/{kind}')
    async def upload_profile_image(kind:str,request:Request):
        me=auth(request)
        limit(request,18,60)
        if kind not in ('avatar','banner','wallpaper'):fail('Неправильний тип фото.',404)
        if request.headers.get('origin') and request.headers['origin'].split('://')[-1].lower()!=request.headers.get('host','').lower():
            fail('Заборонене джерело.',403)
        data=bytearray()
        async for part in request.stream():
            data.extend(part)
            if len(data)>4_000_000:fail('Фото має бути менше 4 МБ.',413)
        if not data:fail('Немає файлу.')
        try:
            with Image.open(io.BytesIO(data)) as original:
                if original.format not in ('PNG','JPEG','WEBP'):fail('Дозволені лише JPEG, PNG, WebP.',415)
                if original.width*original.height>18_000_000:fail('Зображення надто велике.',413)
                original.load()
                rgb=original.convert('RGB')
                # Output photo is resampled to a bounded size; no custom external metadata is stored.
                bounds={'avatar':(800,800),'banner':(1800,700),'wallpaper':(1600,2200)}[kind]
                rgb.thumbnail(bounds,Image.Resampling.LANCZOS)
                out=io.BytesIO()
                rgb.save(out,'WEBP',quality=82,method=4)
        except (UnidentifiedImageError,OSError,ValueError):
            fail('Неможливо відкрити зображення.',415)
        target=media_dir/f'{me["id"]}-{kind}.webp'
        temp=media_dir/f'{me["id"]}-{kind}-{secrets.token_hex(5)}.tmp'
        temp.write_bytes(out.getvalue())
        temp.replace(target)
        with db() as c:
            c.execute('UPDATE cloux_preferences SET photo_version=photo_version+1 WHERE uid=?',(me['id'],))
            row=c.execute('SELECT photo_version FROM cloux_preferences WHERE uid=?',(me['id'],)).fetchone()
        return {'ok':True,'url':f'/api/profile/{me["id"]}/media/{kind}?v={row["photo_version"]}','version':row['photo_version']}

    @app.delete('/api/profile/media/{kind}')
    def reset_profile_photo(kind:str,request:Request):
        me=auth(request)
        if kind not in ('avatar','banner','wallpaper'):fail('Невідоме фото.',404)
        (media_dir/f'{me["id"]}-{kind}.webp').unlink(missing_ok=True)
        with db() as c:
            c.execute('UPDATE cloux_preferences SET photo_version=photo_version+1 WHERE uid=?',(me['id'],))
        return {'ok':True}

    @app.patch('/api/profile/status')
    def set_status(data:Mood, request:Request):
        me=auth(request)
        with db() as c:
            c.execute('UPDATE cloux_preferences SET status=? WHERE uid=?',(data.status.strip(),me['id']))
        return {'ok':True}

    @app.patch('/api/profile/theme')
    def set_theme(data:ThemePayload,request:Request):
        me=auth(request)
        if data.theme not in ('dark','light'):fail('Тема має бути світлою або темною.')
        if not __import__('re').fullmatch(r'#[0-9a-fA-F]{6}',data.accent):fail('Некоректний колір.')
        if not 0<=data.wallpaper_blur<=25 or not 0<=data.wallpaper_dim<=80:fail('Некоректні параметри шпалер.')
        with db() as c:
            c.execute('UPDATE cloux_preferences SET theme=?,accent=?,wallpaper_blur=?,wallpaper_dim=? WHERE uid=?',
             (data.theme,data.accent.upper(),data.wallpaper_blur,data.wallpaper_dim,me['id']))
        return {'ok':True}

    @app.get('/api/users/{uid}/card')
    def user_card(uid:str,request:Request):
        auth(request)
        with db() as c:
            row=c.execute('''SELECT u.id,u.username,u.display,p.bio,p.status,p.photo_version,
                        COALESCE(pr.seen,0) last_seen
                        FROM users u LEFT JOIN cloux_preferences p ON p.uid=u.id
                        LEFT JOIN cloux_presence pr ON pr.uid=u.id WHERE u.id=?''',(uid,)).fetchone()
        if not row:fail('Користувача не знайдено.',404)
        return {'user':{**dict(row),'online':row['last_seen']>int(time.time())-90}}

    @app.post('/api/presence/ping')
    def ping(request:Request):
        me=auth(request)
        with db() as c:
            c.execute('INSERT INTO cloux_presence(uid,seen) VALUES(?,?) ON CONFLICT(uid) DO UPDATE SET seen=excluded.seen',(me['id'],int(time.time())))
        return {'ok':True}

    @app.post('/api/chats/{cid}/read')
    def read(cid:str,request:Request):
        me=auth(request)
        with db() as c:
            if not member(c,me['id'],cid):fail('Немає доступу.',403)
            row=c.execute('SELECT COALESCE(MAX(id),0) n FROM messages WHERE chat_id=?',(cid,)).fetchone()
            c.execute('INSERT INTO cloux_reads(chat_id,uid,last_id) VALUES(?,?,?) ON CONFLICT(chat_id,uid) DO UPDATE SET last_id=MAX(last_id,excluded.last_id)',(cid,me['id'],row['n']))
        return {'ok':True,'last_read':row['n']}

    @app.get('/api/chats/{cid}/read-status')
    def read_status(cid:str,request:Request):
        me=auth(request)
        with db() as c:
            if not member(c,me['id'],cid):fail('Немає доступу.',403)
            rows=c.execute('SELECT uid,last_id FROM cloux_reads WHERE chat_id=?',(cid,)).fetchall()
        return {'reads':{r['uid']:r['last_id'] for r in rows}}

    @app.post('/api/messages/{mid}/reactions')
    def toggle_reaction(mid:int,data:ReactionPayload,request:Request):
        me=auth(request)
        # Emoji presentation sequences (including ZWJ/variation selectors) are allowed,
        # while plain text and control characters are not.
        valid_emoji=any(0x1F000<=ord(ch)<=0x1FAFF or 0x2600<=ord(ch)<=0x27BF for ch in data.emoji)
        if not valid_emoji or any(ord(ch)<32 for ch in data.emoji):
            fail('Оберіть емодзі, а не текст.')
        with db() as c:
            row=c.execute('SELECT chat_id FROM messages WHERE id=?',(mid,)).fetchone()
            if not row:fail('Повідомлення не знайдено.',404)
            if not member(c,me['id'],row['chat_id']):fail('Немає доступу.',403)
            old=c.execute('SELECT 1 FROM cloux_reactions WHERE message_id=? AND uid=? AND emoji=?',(mid,me['id'],data.emoji)).fetchone()
            if old:c.execute('DELETE FROM cloux_reactions WHERE message_id=? AND uid=? AND emoji=?',(mid,me['id'],data.emoji))
            else:c.execute('INSERT INTO cloux_reactions(message_id,uid,emoji) VALUES(?,?,?)',(mid,me['id'],data.emoji))
        return {'ok':True,'added':not bool(old)}

    @app.get('/api/chats/{cid}/reactions')
    def reactions(cid:str,request:Request):
        me=auth(request)
        with db() as c:
            if not member(c,me['id'],cid):fail('Немає доступу.',403)
            rows=c.execute('''SELECT r.message_id,r.emoji,r.uid FROM cloux_reactions r JOIN messages m ON r.message_id=m.id WHERE m.chat_id=? ORDER BY m.id DESC LIMIT 2000''',(cid,)).fetchall()
        result={}
        for row in rows:
            key=str(row['message_id']);emoji=row['emoji']
            entry=result.setdefault(key,{})
            e=entry.setdefault(emoji,{'count':0,'me':False})
            e['count']+=1
            if row['uid']==me['id']:e['me']=True
        return {'reactions':result}

    @app.post('/api/servers')
    def create_server(data:ServerCreate,request:Request):
        me=auth(request);limit(request,8,3600)
        sid=str(uuid.uuid4());code=secrets.token_urlsafe(12)
        with db() as c:
            c.execute('INSERT INTO cloux_servers(id,name,description,owner_id,created,invite_code) VALUES(?,?,?,?,?,?)',
                      (sid,data.name.strip(),data.description.strip(),me['id'],int(time.time()),code))
            c.execute('INSERT INTO cloux_server_members(server_id,uid,role) VALUES(?,?,?)',(sid,me['id'],'owner'))
        return {'server_id':sid,'invite_code':code}

    @app.get('/api/servers')
    def list_servers(request:Request):
        me=auth(request)
        with db() as c:
            rows=c.execute('''SELECT s.id,s.name,s.description,sm.role,
                             (SELECT COUNT(*) FROM cloux_server_members x WHERE x.server_id=s.id) member_count
                             FROM cloux_servers s JOIN cloux_server_members sm ON sm.server_id=s.id AND sm.uid=? ORDER BY s.created DESC''',(me['id'],)).fetchall()
        return {'servers':[dict(x) for x in rows]}

    @app.get('/api/servers/{sid}')
    def server_details(sid:str,request:Request):
        me=auth(request)
        with db() as c:
            role=server_role(c,sid,me['id'])
            if not role:fail('Немає доступу до сервера.',403)
            s=c.execute('SELECT id,name,description,invite_code FROM cloux_servers WHERE id=?',(sid,)).fetchone()
            channels=c.execute('''SELECT ch.id,ch.title,ch.kind FROM chats ch JOIN cloux_server_channels sc ON ch.id=sc.chat_id WHERE sc.server_id=? ORDER BY sc.sort_order,ch.created''',(sid,)).fetchall()
            users=c.execute('''SELECT u.id,u.display,u.username,sm.role,
                                COALESCE(p.seen,0) last_seen
                                FROM cloux_server_members sm JOIN users u ON sm.uid=u.id
                                LEFT JOIN cloux_presence p ON p.uid=u.id WHERE sm.server_id=? ORDER BY sm.role,u.display LIMIT 100''',(sid,)).fetchall()
        return {'server':{**dict(s),'role':role,'invite_code':s['invite_code'] if role in ('owner','admin') else None},
                'channels':[dict(x) for x in channels],
                'members':[{**dict(x),'online':x['last_seen']>int(time.time())-90} for x in users]}

    @app.post('/api/servers/join/{code}')
    def join_server(code:str,request:Request):
        me=auth(request);limit(request,15,60)
        with db() as c:
            server=c.execute('SELECT id FROM cloux_servers WHERE invite_code=?',(code,)).fetchone()
            if not server:fail('Запрошення недійсне.',404)
            sid=server['id']
            if c.execute('SELECT COUNT(*) n FROM cloux_server_members WHERE server_id=?',(sid,)).fetchone()['n']>=100 and not server_role(c,sid,me['id']):fail('Сервер заповнений.')
            c.execute("INSERT OR IGNORE INTO cloux_server_members(server_id,uid,role) VALUES(?,?,'member')",(sid,me['id']))
            for chat in c.execute('SELECT chat_id FROM cloux_server_channels WHERE server_id=?',(sid,)).fetchall():
                c.execute('INSERT OR IGNORE INTO chat_members(chat_id,user_id) VALUES(?,?)',(chat['chat_id'],me['id']))
        return {'server_id':sid}

    @app.post('/api/servers/{sid}/channels')
    def create_channel(sid:str,data:ChannelCreate,request:Request):
        me=auth(request)
        with db() as c:
            if server_role(c,sid,me['id']) not in ('owner','admin'):fail('Недостатньо прав.',403)
            cid=str(uuid.uuid4())
            c.execute("INSERT INTO chats(id,title,kind,created) VALUES(?,?,?,?)",(cid,data.name.strip(),'group',int(time.time())))
            members=c.execute('SELECT uid FROM cloux_server_members WHERE server_id=?',(sid,)).fetchall()
            c.executemany('INSERT INTO chat_members(chat_id,user_id) VALUES(?,?)',[(cid,x['uid']) for x in members])
            c.execute('INSERT INTO cloux_server_channels(server_id,chat_id,sort_order) VALUES(?,?,?)',(sid,cid,int(time.time())))
        return {'chat_id':cid}

    @app.patch('/api/servers/{sid}/members/{uid}')
    def change_role(sid:str,uid:str,data:RoleUpdate,request:Request):
        me=auth(request)
        if data.role not in ('admin','member'):fail('Доступні ролі: admin/member.')
        with db() as c:
            if server_role(c,sid,me['id'])!='owner':fail('Тільки власник може змінювати ролі.',403)
            if uid==me['id']:fail('Роль власника незмінна.')
            if not server_role(c,sid,uid):fail('Користувач не є учасником.',404)
            c.execute('UPDATE cloux_server_members SET role=? WHERE server_id=? AND uid=?',(data.role,sid,uid))
        return {'ok':True}