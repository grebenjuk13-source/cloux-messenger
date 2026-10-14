"""HTTP/API regressions for Cloux modern social features."""
import hashlib
import io
import os
import tempfile

os.environ['CLOUX_DATA']=tempfile.mkdtemp(prefix='cloux-social-test-')
from main import app,requests_by_ip,db
from fastapi.testclient import TestClient
from PIL import Image
from tests.auth_helpers import create_account


def test_default_avatar_is_exact_original_bytes():
    with TestClient(app,base_url='https://testserver') as c:
        r=c.get('/assets/cloux-default-avatar.jpg')
        assert r.status_code==200,r.text
        assert r.headers['content-type'].startswith('image/jpeg')
        assert hashlib.sha256(r.content).hexdigest()=='8de37080f401e70f228a9871b111c0e398f09d41d40511a8ca21f7cfdcfbc6a1'
        for path in ('/modern','/ui/app.js','/ui/core.js','/ui/styles.css'):
            response=c.get(path)
            assert response.status_code==200,(path,response.text[:160])


def test_profile_media_reactions_reads_roles():
    requests_by_ip.clear()  # Independent test client rate-limit state.
    with TestClient(app,base_url='https://testserver') as a,TestClient(app,base_url='https://testserver') as b:
        aa=create_account(a,phone='+380670090011',display='Олена',username='person_aa',password='HelloAA123')
        bb=create_account(b,phone='+380670090012',display='Макс',username='person_bb',password='HelloBB123')
        assert a.patch('/api/profile/status',json={'status':'На звʼязку'}).status_code==200
        assert a.patch('/api/profile/theme',json={'theme':'light','accent':'#8B5CF6','wallpaper_blur':7,'wallpaper_dim':33}).status_code==200
        save=a.put('/api/v5/ui-prefs',json={'theme':'light','accent':'#8B5CF6','wall_blur':7,'wall_dim':33})
        assert save.status_code==200,save.text
        pref=a.get('/api/v5/ui-prefs').json()['preferences']
        assert pref['theme']=='light' and pref['accent']=='#8B5CF6' and pref['wall_blur']==7
        img=Image.new('RGB',(80,80),(150,200,220))
        buffer=io.BytesIO();img.save(buffer,'JPEG')
        upload=a.post('/api/profile/media/avatar',content=buffer.getvalue(),headers={'content-type':'image/jpeg'})
        assert upload.status_code==200,upload.text
        assert b.get(f'/api/profile/{aa}/media/avatar').status_code==200
        assert b.get(f'/api/profile/{aa}/media/wallpaper').status_code==403
        cid=a.post('/api/direct/'+bb).json()['chat_id']
        first=a.post('/api/chats/'+cid+'/messages',json={'text':'Важливе повідомлення'})
        assert first.status_code==200
        mid=first.json()['id']
        assert b.post(f'/api/messages/{mid}/reactions',json={'emoji':'❤️'}).status_code==200
        reactions=a.get('/api/chats/'+cid+'/reactions').json()['reactions']
        assert reactions[str(mid)]['❤️']['count']==1
        assert a.post(f'/api/messages/{mid}/reactions',json={'emoji':'hello'}).status_code==400
        assert b.post('/api/chats/'+cid+'/read').status_code==200
        assert a.get('/api/chats/'+cid+'/read-status').json()['reads'][bb]>=mid
        server=a.post('/api/servers',json={'name':'Cloux Fans','description':'Команда'}).json()
        sid=server['server_id'];invite=server['invite_code']
        assert b.get('/api/servers/'+sid).status_code==403
        assert b.post('/api/servers/join/'+invite).status_code==200
        assert b.post(f'/api/servers/{sid}/channels',json={'name':'rules'}).status_code==403
        ch=a.post(f'/api/servers/{sid}/channels',json={'name':'general'})
        assert ch.status_code==200,ch.text
        chat_id=ch.json()['chat_id']
        assert b.post(f'/api/chats/{chat_id}/messages',json={'text':'hello'}).status_code==200
        assert a.patch(f'/api/servers/{sid}/members/{bb}',json={'role':'admin'}).status_code==200
        assert b.post(f'/api/servers/{sid}/channels',json={'name':'announcements'}).status_code==200
        assert b.patch(f'/api/servers/{sid}/members/{aa}',json={'role':'member'}).status_code==403
        assert a.delete('/api/profile/media/avatar').status_code==200
        assert b.get(f'/api/profile/{aa}/media/avatar').status_code==404


def test_chat_attachments_are_in_database_and_survive_file_store_absence():
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as alice, TestClient(app,base_url='https://testserver') as bob:
        create_account(alice,phone='+380670090021',username='media_alice',display='Аліса',password='MediaAlice123!')
        bob_id=create_account(bob,phone='+380670090022',username='media_bob',display='Боб',password='MediaBob123!')
        chat_id=alice.post('/api/direct/'+bob_id).json()['chat_id']
        image=Image.new('RGB',(24,24),(90,30,45))
        buffer=io.BytesIO();image.save(buffer,'JPEG');payload=buffer.getvalue()
        sent=alice.post('/api/chats/'+chat_id+'/media',content=payload,headers={'content-type':'image/jpeg','x-cloux-filename':'photo.jpg'})
        assert sent.status_code==200,sent.text
        path=f"/api/chats/{chat_id}/media/{sent.json()['media_id']}"
        fetched=bob.get(path)
        assert fetched.status_code==200,fetched.text
        assert fetched.content==payload
        with db() as conn:
            stored=conn.execute('SELECT content FROM cloux_blobs WHERE storage_key=?',
                ('chat-attachment/'+sent.json()['media_id'],)).fetchone()
        assert stored is not None and bytes(stored['content'])==payload
