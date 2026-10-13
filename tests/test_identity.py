"""Social cosmetics authorization and persistence smoke tests."""
import uuid
from fastapi.testclient import TestClient
from main import app,requests_by_ip
from tests.auth_helpers import create_account

def user(client,label):
    suffix=uuid.uuid4().hex[:11]
    return create_account(client,phone='+38067'+str(uuid.uuid4().int%10000000).zfill(7),username='vg'+suffix,display=label,password='TestGift123!')

def test_gifts_friend_only_and_persistent():
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as first:
        a=user(first,'Друг')
        with TestClient(app,base_url='https://testserver') as second:
            b=user(second,'Подруга')
            assert first.get('/api/cloux/gifts/catalog').status_code==200
            assert first.post('/api/cloux/gifts/send',json={'recipient_id':b,'gift_id':'cloud'}).status_code==403
            assert first.post('/api/cloux/friends/'+b+'/request').status_code==200
            assert second.post('/api/cloux/friends/'+a+'/accept').status_code==200
            sent=first.post('/api/cloux/gifts/send',json={'recipient_id':b,'gift_id':'cloud','note':'Вітаю!'})
            assert sent.status_code==200,sent.text
            received=second.get('/api/cloux/gifts/'+b).json()['gifts']
            assert any(g['item']=='cloud' and g['note']=='Вітаю!' for g in received)
            assert second.get('/api/cloux/gifts/'+a).status_code==200

def test_admin_refuses_unpinned_account(monkeypatch):
    requests_by_ip.clear()
    monkeypatch.delenv('CLOUX_ADMIN_USER_ID',raising=False)
    with TestClient(app,base_url='https://testserver') as client:
        uid=user(client,'Звичайний')
        assert client.get('/api/cloux/admin/access').json()['admin'] is False
        assert client.get('/api/cloux/admin/users').status_code==403
        assert client.put('/api/cloux/admin/users/'+uid+'/verification',json={'verified':True}).status_code==403
        assert client.get('/api/cloux/badges/'+uid).json()['verified'] is False
