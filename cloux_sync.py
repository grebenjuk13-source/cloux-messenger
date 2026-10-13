"""Versioned account state for CLOUD sync. Requires durable SQL volume for permanence."""
import json, time
from fastapi import Request
from pydantic import BaseModel, Field
from typing import Literal
Scope=Literal['drafts','folders','stickers','pinned_friends','call_history','ui_preferences']
class StateWrite(BaseModel):
    value:dict|list=Field(default_factory=dict)
    expected_revision:int|None=Field(default=None,ge=0)
def install(app,db,auth,fail):
    with db() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS cloux_account_sync(
            uid TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            scope TEXT NOT NULL,
            revision INTEGER NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY(uid,scope))""")
    def get_scope(c,uid,scope):
        row=c.execute('SELECT revision,value,updated_at FROM cloux_account_sync WHERE uid=? AND scope=?',(uid,scope)).fetchone()
        return {'scope':scope,'revision':row['revision'],'updated_at':row['updated_at'],'value':json.loads(row['value'])} if row else {'scope':scope,'revision':0,'updated_at':0,'value':{}}
    @app.get('/api/cloux/sync/snapshot')
    def sync_snapshot(request:Request):
        user=auth(request)
        with db() as c:
            return {'states':{scope:get_scope(c,user['id'],scope) for scope in ('drafts','folders','stickers','pinned_friends','call_history','ui_preferences')}}
    @app.get('/api/cloux/sync/{scope}')
    def sync_read(scope:Scope,request:Request):
        user=auth(request)
        with db() as c:return get_scope(c,user['id'],scope)
    @app.put('/api/cloux/sync/{scope}')
    def sync_write(scope:Scope,body:StateWrite,request:Request):
        user=auth(request)
        raw=json.dumps(body.value,ensure_ascii=False,separators=(',',':'))
        if len(raw.encode('utf-8'))>131072:fail('Стан перевищує дозволений розмір.',413)
        with db() as c:
            current=get_scope(c,user['id'],scope)
            if body.expected_revision is not None and body.expected_revision!=current['revision']:
                fail('Стан змінився на іншому пристрої. Онови дані.',409)
            revision=current['revision']+1
            now=int(time.time())
            c.execute("""INSERT INTO cloux_account_sync(uid,scope,revision,value,updated_at)
                VALUES(?,?,?,?,?)
                ON CONFLICT(uid,scope) DO UPDATE SET revision=excluded.revision,value=excluded.value,updated_at=excluded.updated_at""",
                (user['id'],scope,revision,raw,now))
            return {'scope':scope,'revision':revision,'updated_at':now,'value':body.value}
