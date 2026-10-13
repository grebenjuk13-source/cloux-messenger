"""Verified account-owned cosmetics; owner tools require BOTH normalized email and server-pinned UID."""
import os,time
from fastapi import Request
from pydantic import BaseModel,Field
from typing import Literal

ADMIN_EMAIL='grebenjuk13@gmail.com'
GIFTS={'cloud':('☁️','Хмарка'),'heart':('💜','Серце'),'star':('🌟','Зірка'),'flower':('🌸','Квітка'),'moon':('🌙','Місяць'),'gem':('💎','Кристал'),'flame':('🔥','Полум’я'),'cat':('🐈','Котик')}
class Verification(BaseModel):
    verified:bool
class GiftSend(BaseModel):
    recipient_id:str=Field(min_length=1,max_length=128)
    gift_id:Literal['cloud','heart','star','flower','moon','gem','flame','cat']
    note:str=Field(default='',max_length=100)

def install(app,db,auth,fail,limit):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS cloux_verified_badges(
          uid TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
          granted_by TEXT NOT NULL REFERENCES users(id),
          granted_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS cloux_user_gifts(
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          receiver TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          item TEXT NOT NULL,note TEXT NOT NULL,created INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS cloux_user_gifts_receiver ON cloux_user_gifts(receiver,id DESC);
        """)
    def admin_user(c,uid):
        # Email is not verified on signup. Never authorize by email alone.
        pinned=os.environ.get('CLOUX_ADMIN_USER_ID','').strip()
        if not pinned or uid!=pinned:return False
        row=c.execute('SELECT email FROM users WHERE id=?',(uid,)).fetchone()
        return bool(row and (row['email'] or '').strip().casefold()==ADMIN_EMAIL)
    def require_admin(c,uid):
        if not admin_user(c,uid):fail('Доступ дозволено тільки підтвердженому власнику CLOUX.',403)
    @app.get('/api/cloux/admin/access')
    def admin_access(request:Request):
        me=auth(request)
        with db() as c: granted=admin_user(c,me['id'])
        return {'admin':granted,'configured':bool(os.environ.get('CLOUX_ADMIN_USER_ID'))}
    @app.get('/api/cloux/admin/users')
    def admin_users(request:Request,q:str=''):
        me=auth(request)
        with db() as c:
            require_admin(c,me['id'])
            rows=c.execute("""SELECT u.id,u.username,u.display,EXISTS(
               SELECT 1 FROM cloux_verified_badges b WHERE b.uid=u.id) verified
               FROM users u WHERE u.username LIKE ? OR u.display LIKE ?
               ORDER BY u.created DESC LIMIT 60""",('%'+q[:45]+'%','%'+q[:45]+'%')).fetchall()
        return {'users':[dict(r) for r in rows]}
    @app.put('/api/cloux/admin/users/{uid}/verification')
    def set_verification(uid:str,payload:Verification,request:Request):
        me=auth(request);limit(request,45,60)
        with db() as c:
            require_admin(c,me['id'])
            if not c.execute('SELECT 1 FROM users WHERE id=?',(uid,)).fetchone():fail('Користувача не знайдено.',404)
            if payload.verified:c.execute('INSERT OR REPLACE INTO cloux_verified_badges(uid,granted_by,granted_at) VALUES(?,?,?)',(uid,me['id'],int(time.time())))
            else:c.execute('DELETE FROM cloux_verified_badges WHERE uid=?',(uid,))
        return {'ok':True,'verified':payload.verified}
    @app.get('/api/cloux/badges/{uid}')
    def badge(uid:str,request:Request):
        auth(request)
        with db() as c:exists=c.execute('SELECT 1 FROM cloux_verified_badges WHERE uid=?',(uid,)).fetchone()
        return {'verified':bool(exists)}
    @app.get('/api/cloux/gifts/catalog')
    def catalog(request:Request):
        auth(request)
        return {'gifts':[{'id':k,'emoji':v[0],'name':v[1]} for k,v in GIFTS.items()]}
    @app.get('/api/cloux/gifts/{uid}')
    def received_gifts(uid:str,request:Request):
        auth(request)
        with db() as c:
            rows=c.execute("""SELECT g.id,g.sender,u.username sender_username,u.display sender_display,
               g.item,g.note,g.created FROM cloux_user_gifts g
               JOIN users u ON u.id=g.sender WHERE g.receiver=? ORDER BY g.id DESC LIMIT 100""",(uid,)).fetchall()
        return {'gifts':[{**dict(r),'emoji':GIFTS.get(r['item'],('🎁','Подарунок'))[0]} for r in rows]}
    @app.post('/api/cloux/gifts/send')
    def send_gift(body:GiftSend,request:Request):
        me=auth(request);limit(request,12,86400)
        if body.recipient_id==me['id']:fail('Не можна надіслати подарунок самому собі.',400)
        with db() as c:
            ids=sorted([me['id'],body.recipient_id])
            friends=c.execute('SELECT 1 FROM cloux_friendships WHERE a=? AND b=?',ids).fetchone()
            if not friends:fail('Подарунки можна надсилати тільки друзям.',403)
            c.execute('INSERT INTO cloux_user_gifts(sender,receiver,item,note,created) VALUES(?,?,?,?,?)',
                      (me['id'],body.recipient_id,body.gift_id,body.note.strip(),int(time.time())))
        return {'ok':True}
