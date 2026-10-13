"""Opt-in social experience for Cloux: verified rankings, chat streaks, stories, notifications.

Uses existing users, friendships and messages tables. Existing account/chat data is never rewritten.
"""
import json
import time
from datetime import datetime,timezone,timedelta
from fastapi import Request
from pydantic import BaseModel,Field
from typing import Literal

class StoryPayload(BaseModel):
    text:str=Field(min_length=1,max_length=240)
    background:Literal['ink','ruby','merlot','mist','silver']='ink'

def install(app,db,auth,fail,limit):
    with db() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS cloux_stories(
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           text TEXT NOT NULL,background TEXT NOT NULL,
           created INTEGER NOT NULL,expires INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS cloux_stories_active ON cloux_stories(expires,created DESC);
        CREATE TABLE IF NOT EXISTS cloux_story_views(
           story_id INTEGER NOT NULL REFERENCES cloux_stories(id) ON DELETE CASCADE,
           uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           seen INTEGER NOT NULL, PRIMARY KEY(story_id,uid));
        CREATE TABLE IF NOT EXISTS cloux_events(
           id INTEGER PRIMARY KEY AUTOINCREMENT,
           uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           kind TEXT NOT NULL,actor TEXT REFERENCES users(id),
           ref TEXT,created INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS cloux_events_user ON cloux_events(uid,id DESC);
        CREATE TABLE IF NOT EXISTS cloux_pinned_messages(
          chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
          message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          pinned_by TEXT NOT NULL REFERENCES users(id), created INTEGER NOT NULL,
          PRIMARY KEY(chat_id,message_id));
        """)
    def friend(c,a,b):
        if a==b:return True
        pair=sorted([a,b])
        return c.execute("SELECT 1 FROM cloux_friendships WHERE a=? AND b=?",pair).fetchone() is not None
    def friends(c,uid):
        return [r['uid'] for r in c.execute("""
         SELECT CASE WHEN f.a=? THEN f.b ELSE f.a END uid
         FROM cloux_friendships f WHERE f.a=? OR f.b=?""",(uid,uid,uid))]
    def streak_days(c,a,b):
        # Only direct messages exchanged by BOTH people on the same UTC day count.
        rows=c.execute("""SELECT m.sender,CAST(m.created / 86400 AS INTEGER) day
          FROM messages m JOIN chats ch ON m.chat_id=ch.id AND ch.kind='direct'
          JOIN chat_members m1 ON m1.chat_id=ch.id AND m1.user_id=?
          JOIN chat_members m2 ON m2.chat_id=ch.id AND m2.user_id=?
          WHERE m.sender IN (?,?) GROUP BY m.sender,day""",(a,b,a,b)).fetchall()
        days_a={r['day'] for r in rows if r['sender']==a}
        days_b={r['day'] for r in rows if r['sender']==b}
        days=days_a & days_b
        now=int(time.time())//86400
        start=now if now in days else now-1
        score=0
        while start-score in days:score+=1
        return score
    def leaderboard_rows(c):
        people=[dict(x) for x in c.execute("SELECT id,display,username,created FROM users WHERE id!='cloux-system'")]
        stamp_map={}
        for user in people:
            links=c.execute("""SELECT CASE WHEN a=? THEN b ELSE a END other,created
               FROM cloux_friendships WHERE a=? OR b=? ORDER BY created ASC""",(user['id'],user['id'],user['id'])).fetchall()
            user['friends']=len(links)
            # Earliest reached this total: time of latest accepted friendship.
            user['reached']=max([x['created'] for x in links],default=user['created'])
            user['streak']=max((streak_days(c,user['id'],x['other']) for x in links),default=0)
            stamp_map[user['id']]=user['reached']
        return people
    def with_rank(rows,field):
        sorted_rows=sorted(rows,key=lambda x:(-x[field],x['reached'],x['created'],x['username'].casefold()))
        previous=None;rank=0
        for i,row in enumerate(sorted_rows):
            if row[field]!=previous:rank=i+1;previous=row[field]
            row['rank']=rank
        return sorted_rows
    def badge(points):
        if points>=500:return 'legend'
        if points>=100:return 'century'
        if points>=50:return 'veteran'
        if points>=10:return 'social'
        return 'rookie'

    @app.get('/api/cloux/top')
    def top(request:Request,sort:Literal['friends','streak']='friends',limit_count:int=50):
        user=auth(request)
        count=max(10,min(limit_count,100))
        with db() as c: rows=with_rank(leaderboard_rows(c),sort)
        for row in rows:row['badge']=badge(row['friends'])
        own=next((dict(x) for x in rows if x['id']==user['id']),None)
        return {'rows':rows[:count], 'me':own,'total':len(rows),'sort':sort,'generated':int(time.time())}

    @app.get('/api/cloux/streaks')
    def my_streaks(request:Request):
        user=auth(request)
        with db() as c:
            result=[{'friend_id':b,'days':streak_days(c,user['id'],b)} for b in friends(c,user['id'])]
        return {'streaks':sorted(result,key=lambda x:-x['days'])}

    @app.get('/api/cloux/stories')
    def stories(request:Request):
        user=auth(request)
        now=int(time.time())
        with db() as c:
            linked=friends(c,user['id'])
            allowed=[user['id'],*linked]
            # Parameterized account and friends only; visibility never includes unknown strangers.
            rows=c.execute("""SELECT s.id,s.uid,u.username,u.display,s.text,s.background,s.created,s.expires,
                    EXISTS(SELECT 1 FROM cloux_story_views v WHERE v.story_id=s.id AND v.uid=?) viewed
               FROM cloux_stories s JOIN users u ON s.uid=u.id
               WHERE s.expires>? AND s.uid IN ("""+','.join(['?']*len(allowed))+""")
               ORDER BY s.created DESC LIMIT 160""",(user['id'],now,*allowed)).fetchall()
        return {'stories':[dict(r) for r in rows]}

    @app.post('/api/cloux/stories')
    def create_story(payload:StoryPayload,request:Request):
        user=auth(request);limit(request,15,3600)
        now=int(time.time())
        with db() as c:
            cur=c.execute('INSERT INTO cloux_stories(uid,text,background,created,expires) VALUES(?,?,?,?,?)',
               (user['id'],payload.text.strip(),payload.background,now,now+86400))
        return {'ok':True,'id':cur.lastrowid}

    @app.post('/api/cloux/stories/{story_id}/seen')
    def seen(story_id:int,request:Request):
        user=auth(request)
        with db() as c:
            item=c.execute('SELECT uid,expires FROM cloux_stories WHERE id=?',(story_id,)).fetchone()
            if not item or item['expires']<=int(time.time()):fail('Історію не знайдено.',404)
            if not friend(c,user['id'],item['uid']):fail('Немає доступу до історії.',403)
            c.execute('INSERT OR IGNORE INTO cloux_story_views(story_id,uid,seen) VALUES(?,?,?)',
               (story_id,user['id'],int(time.time())))
        return {'ok':True}

    @app.delete('/api/cloux/stories/{story_id}')
    def delete_story(story_id:int,request:Request):
        user=auth(request)
        with db() as c:
            cur=c.execute('DELETE FROM cloux_stories WHERE id=? AND uid=?',(story_id,user['id']))
            if not cur.rowcount:fail('Історію не знайдено.',404)
        return {'ok':True}

    @app.get('/api/cloux/chat/{chat_id}/pins')
    def pinned_messages(chat_id:str,request:Request):
        u=auth(request)
        with db() as c:
            if not c.execute('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?',(chat_id,u['id'])).fetchone():fail('Доступ заборонено.',403)
            rows=c.execute("""SELECT m.id,m.sender,m.text,m.created FROM cloux_pinned_messages p
               JOIN messages m ON m.id=p.message_id WHERE p.chat_id=? ORDER BY p.created DESC LIMIT 30""",(chat_id,)).fetchall()
        return {'pinned':[dict(x) for x in rows]}
    @app.post('/api/cloux/chat/{chat_id}/pin/{message_id}')
    def pin_message(chat_id:str,message_id:int,request:Request):
        u=auth(request);limit(request,60,60)
        with db() as c:
            if not c.execute('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?',(chat_id,u['id'])).fetchone():fail('Доступ заборонено.',403)
            if not c.execute('SELECT 1 FROM messages WHERE id=? AND chat_id=?',(message_id,chat_id)).fetchone():fail('Повідомлення не знайдено.',404)
            c.execute('INSERT OR IGNORE INTO cloux_pinned_messages(chat_id,message_id,pinned_by,created) VALUES(?,?,?,?)',(chat_id,message_id,u['id'],int(time.time())))
        return {'ok':True}
    @app.delete('/api/cloux/chat/{chat_id}/pin/{message_id}')
    def unpin_message(chat_id:str,message_id:int,request:Request):
        u=auth(request)
        with db() as c:
            if not c.execute('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?',(chat_id,u['id'])).fetchone():fail('Доступ заборонено.',403)
            c.execute('DELETE FROM cloux_pinned_messages WHERE chat_id=? AND message_id=?',(chat_id,message_id))
        return {'ok':True}

    @app.get('/api/cloux/notifications')
    def notifications(request:Request):
        user=auth(request)
        with db() as c:
            events=c.execute("""SELECT n.id,n.kind,n.created,n.ref,
                    COALESCE(u.display,'CLOUX') actor_display,
                    COALESCE(u.username,'cloux') actor_username,
                    n.actor actor_id
                FROM cloux_events n LEFT JOIN users u ON u.id=n.actor
                WHERE n.uid=? ORDER BY n.id DESC LIMIT 60""",(user['id'],)).fetchall()
            requests=c.execute("""SELECT r.sender id,u.display,u.username,r.created
                  FROM cloux_friend_requests r JOIN users u ON u.id=r.sender
                  WHERE r.recipient=? ORDER BY r.created DESC LIMIT 25""",(user['id'],)).fetchall()
        return {'events':[dict(r) for r in events],
                'requests':[dict(r) for r in requests]}

    def record(c,uid,kind,actor,ref=''):
        c.execute('INSERT INTO cloux_events(uid,kind,actor,ref,created) VALUES(?,?,?,?,?)',
                 (uid,kind,actor,ref,int(time.time())))
        c.execute("""DELETE FROM cloux_events WHERE uid=? AND id NOT IN
                     (SELECT id FROM cloux_events WHERE uid=? ORDER BY id DESC LIMIT 120)""",(uid,uid))
    app.state.cloux_record_event=record
