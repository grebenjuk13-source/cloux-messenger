"""Cloux product: reciprocal friendships, profile pages, wallpaper styles and server preferences.

Per-account storage is access-checked. Render's default /tmp database remains ephemeral.
"""
from __future__ import annotations
import hashlib
import asyncio
import io
import json
import re
import time
from pathlib import Path
from typing import Literal
from fastapi import Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from PIL import Image, UnidentifiedImageError

class ProductSettings(BaseModel):
    friends_visibility: Literal['all','friends','none']='all'
    show_online: bool=True
    allow_requests: bool=True
    allow_calls: bool=True
    show_message_preview: bool=True
    notifications_messages: bool=True
    notifications_calls: bool=True
    notifications_sound: bool=True
    language: Literal['uk']='uk'
    backup_interval: Literal['off','daily','weekly']='off'
    profile_accent: str='#E11D2E'
    banner_gradient: str='linear-gradient(120deg,#390c1b,#08090e)'
    status_icon: str='✨'
    banner_video: bool=False

class Wallpaper(BaseModel):
    kind: Literal['preset','gradient','image']='preset'
    preset: str='w0'
    colors: list[str]=Field(default_factory=lambda:['#1a111e','#1c1625'])
    angle: int=Field(default=135,ge=0,le=360)
    pattern: Literal['none','dots','lines','stars','grid']='none'
    intensity: int=Field(default=15,ge=0,le=100)
    blur: int=Field(default=0,ge=0,le=24)
    dim: int=Field(default=12,ge=0,le=75)
    animate: bool=False
    parallax: bool=False

class StyleUpdate(BaseModel):
    profile_accent: str='#E11D2E'
    banner_gradient: str='linear-gradient(120deg,#390c1b,#08090e)'
    status_icon: str='✨'

HEX=re.compile(r'^#[0-9a-fA-F]{6}$')
def checked_style(d):
    if not HEX.fullmatch(d['profile_accent']):
        raise ValueError('Некоректний колір.')
    if not re.fullmatch(r'linear-gradient\(\d{1,3}deg,#[a-fA-F0-9]{6},#[a-fA-F0-9]{6}\)',d['banner_gradient']):
        raise ValueError('Некоректний градієнт.')
    if not 1<=len(d['status_icon'])<=8 or '<' in d['status_icon']:
        raise ValueError('Некоректний статус.')

def install(app,db,auth,member,fail,limit,data_dir):
    root=Path(data_dir)/'cloux-wallpaper-media'
    root.mkdir(parents=True,exist_ok=True)
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS cloux_product_settings(
          uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          value TEXT NOT NULL, updated INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_friend_requests(
          sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          recipient TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created INTEGER NOT NULL,
          PRIMARY KEY(sender,recipient),CHECK(sender!=recipient));
        CREATE TABLE IF NOT EXISTS cloux_friendships(
          a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created INTEGER NOT NULL,
          PRIMARY KEY(a,b),CHECK(a<b));
        CREATE TABLE IF NOT EXISTS cloux_wallpaper_settings(
          uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL, mode TEXT NOT NULL,
          value TEXT NOT NULL, updated INTEGER NOT NULL,
          PRIMARY KEY(uid,scope,mode));
        """)
        # Existing reciprocal subscriptions are upgraded to friendships once.
        c.execute("""INSERT OR IGNORE INTO cloux_friendships(a,b,created)
          SELECT f.follower_id,f.followed_id,MIN(f.created)
          FROM cloux_follows f JOIN cloux_follows r
          ON r.follower_id=f.followed_id AND r.followed_id=f.follower_id
          WHERE f.follower_id < f.followed_id GROUP BY f.follower_id,f.followed_id""")

    def settings(c,uid):
        row=c.execute('SELECT value FROM cloux_product_settings WHERE uid=?',(uid,)).fetchone()
        data=json.loads(row['value']) if row else {}
        return ProductSettings.model_validate(data).model_dump()
    def is_friend(c,a,b):
        u,v=sorted((a,b))
        return c.execute('SELECT 1 FROM cloux_friendships WHERE a=? AND b=?',(u,v)).fetchone() is not None
    def relation(c,me,other):
        if me==other:return 'self'
        if is_friend(c,me,other):return 'friend'
        if c.execute('SELECT 1 FROM cloux_friend_requests WHERE sender=? AND recipient=?',(me,other)).fetchone():return 'outgoing'
        if c.execute('SELECT 1 FROM cloux_friend_requests WHERE sender=? AND recipient=?',(other,me)).fetchone():return 'incoming'
        return 'none'
    def friends(c,uid):
        return c.execute('''SELECT u.id,u.display,u.username,
        COALESCE(p.photo_version,0) photo_version,
        COALESCE(pr.seen,0) last_seen
        FROM cloux_friendships f JOIN users u ON u.id=CASE WHEN f.a=? THEN f.b ELSE f.a END
        LEFT JOIN cloux_preferences p ON p.uid=u.id
        LEFT JOIN cloux_presence pr ON pr.uid=u.id
        WHERE f.a=? OR f.b=? ORDER BY u.display COLLATE NOCASE''',(uid,uid,uid)).fetchall()
    def listing_allowed(c,who,viewer):
        policy=settings(c,who)['friends_visibility']
        return viewer==who or policy=='all' or (policy=='friends' and is_friend(c,who,viewer))

    @app.get('/api/cloux/settings')
    def get_settings(request:Request):
        u=auth(request)
        with db() as c:return {'settings':settings(c,u['id'])}

    @app.put('/api/cloux/settings')
    def set_settings(value:ProductSettings,request:Request):
        u=auth(request)
        body=value.model_dump()
        try:checked_style(body)
        except ValueError as e:fail(str(e))
        with db() as c:
            c.execute("""INSERT INTO cloux_product_settings(uid,value,updated) VALUES(?,?,?)
            ON CONFLICT(uid) DO UPDATE SET value=excluded.value,updated=excluded.updated""",
            (u['id'],json.dumps(body,ensure_ascii=False),int(time.time())))
        return {'settings':body,'ok':True}

    @app.get('/api/cloux/profile/{uid}')
    def get_profile(uid:str,request:Request):
        u=auth(request)
        with db() as c:
            target=c.execute("""SELECT u.id,u.display,u.username,u.created,
              COALESCE(p.bio,'') bio,COALESCE(p.status,'') status,
              COALESCE(p.photo_version,0) photo_version,
              COALESCE(pr.seen,0) last_seen
              FROM users u LEFT JOIN cloux_preferences p ON p.uid=u.id
              LEFT JOIN cloux_presence pr ON pr.uid=u.id WHERE u.id=?""",(uid,)).fetchone()
            if not target:fail('Профіль не знайдено.',404)
            st=settings(c,uid)
            member_list=friends(c,uid)
            mutual=([dict(x) for x in member_list if is_friend(c,u['id'],x['id'])] if listing_allowed(c,uid,u['id']) else [])
            return {'profile':{**dict(target),
              'online':st['show_online'] and target['last_seen']>int(time.time())-90,
              'friends_count':len(member_list),'friendship':relation(c,u['id'],uid),
              'mutual':mutual[:12], 'friends_visible':listing_allowed(c,uid,u['id']),
              'accent':st['profile_accent'],'banner_gradient':st['banner_gradient'],
              'status_icon':st['status_icon'],'banner_video':st['banner_video']}}

    @app.patch('/api/cloux/profile/style')
    def set_style(value:StyleUpdate,request:Request):
        u=auth(request)
        change=value.model_dump()
        try:checked_style(change)
        except ValueError as e:fail(str(e))
        with db() as c:
            current=settings(c,u['id'])
            current.update(change)
            c.execute("""INSERT INTO cloux_product_settings(uid,value,updated) VALUES(?,?,?)
              ON CONFLICT(uid) DO UPDATE SET value=excluded.value,updated=excluded.updated""",
              (u['id'],json.dumps(current,ensure_ascii=False),int(time.time())))
        return {'ok':True}

    @app.post('/api/cloux/avatar/animated')
    async def animated_avatar(request:Request):
        u=auth(request);limit(request,10,60)
        data=bytearray()
        async for part in request.stream():
            data.extend(part)
            if len(data)>4_000_000:fail('Аватар має бути до 4 МБ.',413)
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in ('GIF','WEBP') or getattr(image,'n_frames',1)<2:fail('Потрібен анімований GIF або WebP.',415)
                if image.width*image.height>1_000_000 or image.n_frames>60:fail('Анімація завелика.',413)
                frames=[];delays=[]
                for i in range(image.n_frames):
                    image.seek(i)
                    frame=image.convert('RGBA');frame.thumbnail((512,512),Image.Resampling.LANCZOS)
                    frames.append(frame);delays.append(max(40,min(500,int(image.info.get('duration',100)))))
                buffer=io.BytesIO()
                frames[0].save(buffer,format='WEBP',save_all=True,append_images=frames[1:],
                 duration=delays,loop=0,quality=73,method=4)
                if buffer.tell()>4_000_000:fail('Анімація не вміщується у 4 МБ.',413)
        except (UnidentifiedImageError,OSError,ValueError):fail('Анімацію не вдалося обробити.',415)
        destination=Path(data_dir)/'profile-media'
        destination.mkdir(exist_ok=True,parents=True)
        target=destination/(u['id']+'-avatar.webp')
        temp=target.with_suffix('.tmp');temp.write_bytes(buffer.getvalue());temp.replace(target)
        with db() as c:
            c.execute('UPDATE cloux_preferences SET photo_version=photo_version+1 WHERE uid=?',(u['id'],))
            row=c.execute('SELECT photo_version FROM cloux_preferences WHERE uid=?',(u['id'],)).fetchone()
        return {'ok':True,'version':row['photo_version']}

    def video_path(uid,ext):
        return Path(data_dir)/'profile-media'/(uid+'-banner.'+ext)

    @app.post('/api/cloux/banner/video')
    async def upload_banner_video(request:Request):
        u=auth(request);limit(request,6,60)
        mime=request.headers.get('content-type','').split(';')[0].lower()
        if mime not in ('video/mp4','video/webm'):fail('Відео: лише MP4 або WebM.',415)
        data=bytearray()
        async for part in request.stream():
            data.extend(part)
            if len(data)>14_000_000:fail('Відео має бути до 14 МБ.',413)
        ext='mp4' if mime=='video/mp4' else 'webm'
        if len(data)<32 or (ext=='mp4' and bytes(data[4:8])!=b'ftyp') or (ext=='webm' and bytes(data[:4])!=bytes.fromhex('1a45dfa3')):
            fail('Це не підтримуваний відеофайл.',415)
        dest=video_path(u['id'],ext);dest.parent.mkdir(exist_ok=True,parents=True)
        temp=dest.with_suffix('.tmp');temp.write_bytes(data);temp.replace(dest)
        video_path(u['id'],'webm' if ext=='mp4' else 'mp4').unlink(missing_ok=True)
        with db() as c:
            st=settings(c,u['id']);st['banner_video']=True
            c.execute("""INSERT INTO cloux_product_settings(uid,value,updated) VALUES(?,?,?)
              ON CONFLICT(uid) DO UPDATE SET value=excluded.value,updated=excluded.updated""",
              (u['id'],json.dumps(st,ensure_ascii=False),int(time.time())))
        return {'ok':True}

    @app.get('/api/cloux/banner/video/{uid}')
    def banner_video(uid:str,request:Request):
        auth(request)
        with db() as c:
            if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('Профіль не знайдено.',404)
        for ext,mime in [('mp4','video/mp4'),('webm','video/webm')]:
            path=video_path(uid,ext)
            if path.is_file():return FileResponse(path,media_type=mime,headers={'Cache-Control':'private,max-age=120'})
        fail('Банер не знайдено.',404)

    @app.delete('/api/cloux/banner/video')
    def delete_banner_video(request:Request):
        u=auth(request)
        for ext in ('webm','mp4'):video_path(u['id'],ext).unlink(missing_ok=True)
        with db() as c:
            st=settings(c,u['id']);st['banner_video']=False
            c.execute("""INSERT INTO cloux_product_settings(uid,value,updated) VALUES(?,?,?)
              ON CONFLICT(uid) DO UPDATE SET value=excluded.value,updated=excluded.updated""",
              (u['id'],json.dumps(st,ensure_ascii=False),int(time.time())))
        return {'ok':True}

    @app.get('/api/cloux/friends/{uid}')
    def get_friends(uid:str,request:Request,q:str='',sort:Literal['name','online']='name'):
        u=auth(request)
        with db() as c:
            if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('Користувача не знайдено.',404)
            if not listing_allowed(c,uid,u['id']):fail('Список друзів прихований.',403)
            rows=[]
            for r in friends(c,uid):
                if q.strip() and q.lower().strip() not in (r['display']+' '+r['username']).lower():continue
                visible=settings(c,r['id'])['show_online']
                rows.append({'id':r['id'],'display':r['display'],'username':r['username'],
                  'photo_version':r['photo_version'],'online':visible and r['last_seen']>int(time.time())-90})
        rows.sort(key=(lambda x:(not x['online'],x['display'].casefold())) if sort=='online' else lambda x:x['display'].casefold())
        return {'friends':rows}

    @app.get('/api/cloux/friend-requests')
    def friend_requests(request:Request):
        u=auth(request)
        with db() as c:
            got=c.execute("""SELECT r.sender id,u.display,u.username,r.created
              FROM cloux_friend_requests r JOIN users u ON u.id=r.sender WHERE r.recipient=? ORDER BY created DESC""",(u['id'],)).fetchall()
            sent=c.execute("""SELECT r.recipient id,u.display,u.username,r.created
              FROM cloux_friend_requests r JOIN users u ON u.id=r.recipient WHERE r.sender=? ORDER BY created DESC""",(u['id'],)).fetchall()
        return {'incoming':[dict(x) for x in got],'outgoing':[dict(x) for x in sent]}

    @app.post('/api/cloux/friends/{uid}/request')
    def send_request(uid:str,request:Request):
        u=auth(request);limit(request,30,60)
        if uid==u['id'] or uid=='cloux-system':fail('Не можна додати цей профіль.')
        with db() as c:
            if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('Профіль не знайдено.',404)
            if not settings(c,uid)['allow_requests']:fail('Ця людина не приймає запити.',403)
            if is_friend(c,u['id'],uid):return {'ok':True,'relation':'friend'}
            if relation(c,u['id'],uid)=='incoming':
                a,b=sorted((u['id'],uid))
                c.execute('INSERT OR IGNORE INTO cloux_friendships(a,b,created) VALUES(?,?,?)',(a,b,int(time.time())))
                c.execute('DELETE FROM cloux_friend_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',(uid,u['id'],u['id'],uid))
                return {'ok':True,'relation':'friend'}
            c.execute('INSERT OR IGNORE INTO cloux_friend_requests(sender,recipient,created) VALUES(?,?,?)',(u['id'],uid,int(time.time())))
        return {'ok':True,'relation':'outgoing'}

    @app.post('/api/cloux/friends/{uid}/accept')
    def accept(uid:str,request:Request):
        u=auth(request)
        with db() as c:
            if not c.execute('SELECT 1 FROM cloux_friend_requests WHERE sender=? AND recipient=?',(uid,u['id'])).fetchone():fail('Запит не знайдено.',404)
            a,b=sorted((u['id'],uid))
            c.execute('INSERT OR IGNORE INTO cloux_friendships(a,b,created) VALUES(?,?,?)',(a,b,int(time.time())))
            c.execute('DELETE FROM cloux_friend_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',(uid,u['id'],u['id'],uid))
        return {'ok':True,'relation':'friend'}

    @app.delete('/api/cloux/friends/{uid}')
    def remove(uid:str,request:Request):
        u=auth(request)
        a,b=sorted((u['id'],uid))
        with db() as c:
            c.execute('DELETE FROM cloux_friendships WHERE a=? AND b=?',(a,b))
            c.execute('DELETE FROM cloux_friend_requests WHERE (sender=? AND recipient=?) OR (sender=? AND recipient=?)',(uid,u['id'],u['id'],uid))
        return {'ok':True,'relation':'none'}

    def scope_key(c,uid,scope):
        if scope=='all':return scope
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,80}',scope) or not member(c,uid,scope):fail('Чат недоступний.',403)
        return scope
    def mode_key(mode):
        if mode not in ('dark','light'):fail('Невідома тема.')
        return mode
    def verify_wall(value:Wallpaper):
        if len(value.colors)<1 or len(value.colors)>4 or any(not HEX.fullmatch(v) for v in value.colors):
            fail('Градієнт підтримує 1–4 кольори.')
        if not re.fullmatch(r'w[0-9]{1,2}',value.preset) or not 0<=int(value.preset[1:])<34:
            fail('Невідомі шпалери.')
        return value.model_dump()
    def image_path(uid,scope,mode):
        slug=hashlib.sha256((uid+':'+scope+':'+mode).encode()).hexdigest()
        return root/(slug+'.webp')

    @app.get('/api/cloux/wallpaper')
    def get_wallpaper(request:Request,scope:str='all',mode:str='dark'):
        u=auth(request);mode_key(mode)
        with db() as c:
            scope_key(c,u['id'],scope)
            row=c.execute('SELECT value FROM cloux_wallpaper_settings WHERE uid=? AND scope=? AND mode=?',(u['id'],scope,mode)).fetchone()
        return {'wallpaper':json.loads(row['value']) if row else None,'scope':scope,'mode':mode}

    @app.put('/api/cloux/wallpaper')
    def set_wallpaper(value:Wallpaper,request:Request,scope:str='all',mode:str='dark'):
        u=auth(request);mode_key(mode)
        data=verify_wall(value)
        with db() as c:
            scope_key(c,u['id'],scope)
            if data['kind']=='image' and not image_path(u['id'],scope,mode).exists():fail('Спочатку завантаж фото.',400)
            c.execute('''INSERT INTO cloux_wallpaper_settings(uid,scope,mode,value,updated) VALUES(?,?,?,?,?)
            ON CONFLICT(uid,scope,mode) DO UPDATE SET value=excluded.value,updated=excluded.updated''',
            (u['id'],scope,mode,json.dumps(data),int(time.time())))
        return {'ok':True,'wallpaper':data}

    @app.delete('/api/cloux/wallpaper')
    def delete_wallpaper(request:Request,scope:str='all',mode:str='dark'):
        u=auth(request);mode_key(mode)
        with db() as c:
            scope_key(c,u['id'],scope)
            c.execute('DELETE FROM cloux_wallpaper_settings WHERE uid=? AND scope=? AND mode=?',(u['id'],scope,mode))
        return {'ok':True}

    @app.post('/api/cloux/wallpaper/media')
    async def upload_wallpaper(request:Request,scope:str='all',mode:str='dark'):
        u=auth(request);mode_key(mode);limit(request,12,60)
        with db() as c:scope_key(c,u['id'],scope)
        data=bytearray()
        async for part in request.stream():
            data.extend(part)
            if len(data)>5_000_000:fail('Фото має бути менше 5 МБ.',413)
        try:
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in ('PNG','JPEG','WEBP'):fail('Дозволені лише JPEG, PNG, WebP.',415)
                if image.width*image.height>16_000_000:fail('Зображення завелике.',413)
                image=image.convert('RGB');image.thumbnail((1600,2200),Image.Resampling.LANCZOS)
                out=io.BytesIO();image.save(out,'WEBP',quality=85)
        except (UnidentifiedImageError,OSError,ValueError):fail('Неправильне фото.',415)
        target=image_path(u['id'],scope,mode)
        temp=target.with_suffix('.tmp');temp.write_bytes(out.getvalue());temp.replace(target)
        return {'ok':True,'url':f'/api/cloux/wallpaper/media?scope={scope}&mode={mode}&t={int(time.time())}'}

    @app.get('/api/cloux/wallpaper/media')
    def wallpaper_media(request:Request,scope:str='all',mode:str='dark'):
        u=auth(request);mode_key(mode)
        with db() as c:scope_key(c,u['id'],scope)
        path=image_path(u['id'],scope,mode)
        if not path.is_file():fail('Фото не знайдено.',404)
        return FileResponse(path,media_type='image/webp',headers={'Cache-Control':'private,no-store'})

