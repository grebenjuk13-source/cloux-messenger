"""Cloux social experience smoke tests: real ranking, stories, streaks and notifications."""
import uuid
from datetime import datetime,timezone
from fastapi.testclient import TestClient
from main import app,requests_by_ip
from tests.auth_helpers import create_account

def make(client,display):
    value=uuid.uuid4().hex[:11]
    return create_account(client,phone='+38067'+str(uuid.uuid4().int%10000000).zfill(7),
       username='co'+value,display=display,password='TestSocial123!')

def test_rank_friends_streak_and_story_viewing():
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as alice:
        a=make(alice,'Калина')
        with TestClient(app,base_url='https://testserver') as bob:
            b=make(bob,'Данило')
            assert alice.get('/api/cloux/top').status_code==200
            posted=alice.post('/api/cloux/friends/'+b+'/request')
            assert posted.status_code==200,posted.text
            requests=bob.get('/api/cloux/notifications').json()
            assert requests['requests']
            assert bob.post('/api/cloux/friends/'+a+'/accept').status_code==200
            top=alice.get('/api/cloux/top?sort=friends').json()
            own=next(row for row in top['rows'] if row['id']==a)
            assert own['friends']>=1
            assert alice.get('/api/cloux/top?sort=streak').status_code==200
            direct=alice.post('/api/direct/'+b).json()['chat_id']
            assert alice.post('/api/chats/'+direct+'/messages',json={'text':'Привіт сьогодні'}).status_code==200
            assert bob.post('/api/chats/'+direct+'/messages',json={'text':'Привіт у відповідь'}).status_code==200
            streak=alice.get('/api/cloux/streaks').json()['streaks']
            assert next(x for x in streak if x['friend_id']==b)['days']>=1
            new=alice.post('/api/cloux/stories',json={'text':'Мій день ☁️','background':'ruby'})
            assert new.status_code==200,new.text
            story_id=new.json()['id']
            visible=bob.get('/api/cloux/stories').json()['stories']
            assert any(s['id']==story_id for s in visible)
            assert bob.post('/api/cloux/stories/'+str(story_id)+'/seen').status_code==200
            assert next(s for s in bob.get('/api/cloux/stories').json()['stories'] if s['id']==story_id)['viewed']==1
            assert bob.delete('/api/cloux/stories/'+str(story_id)).status_code==404
            assert alice.delete('/api/cloux/stories/'+str(story_id)).status_code==200

def test_stories_hidden_from_strangers_and_rank_contains_me():
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as alice:
        a=make(alice,'Людина')
        response=alice.post('/api/cloux/stories',json={'text':'Для друзів','background':'ink'})
        assert response.status_code==200
        with TestClient(app,base_url='https://testserver') as stranger:
            make(stranger,'Інша')
            assert not [s for s in stranger.get('/api/cloux/stories').json()['stories'] if s['uid']==a]
            assert stranger.post('/api/cloux/stories/'+str(response.json()['id'])+'/seen').status_code==403
            own=stranger.get('/api/cloux/top?limit_count=10').json()['me']
            assert own is not None and own['rank']>=1
