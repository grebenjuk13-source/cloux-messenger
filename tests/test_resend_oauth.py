"""Verify one-button Resend OAuth flow without contacting Resend or sending any email."""
import hashlib
import json
import secrets
import time
from urllib.parse import parse_qs,urlsplit
from fastapi.testclient import TestClient
from main import app, db
import cloux_resend_oauth as oauth

def test_mail_owner_setup_flow(monkeypatch):
    token='u'*48
    monkeypatch.setenv('CLOUX_MAIL_SETUP_SHA256',hashlib.sha256(token.encode()).hexdigest())
    monkeypatch.setenv('CLOUX_MAIL_SETUP_DEADLINE',str(int(time.time())+300))
    monkeypatch.setenv('CLOUX_EMAIL_PEPPER_BOOTSTRAP','f'*48)
    monkeypatch.delenv('CLOUX_EMAIL_PEPPER',raising=False)
    monkeypatch.setenv('CLOUX_EMAIL_FROM','Cloux <noreply@minesmp.store>')
    with db() as con:
        con.execute('DELETE FROM cloux_resend_pending')
        con.execute('DELETE FROM cloux_resend_oauth')
        con.execute('UPDATE cloux_resend_provisioning SET used=0 WHERE id=1')
    monkeypatch.setattr(oauth,'_request_token',lambda params:{
        'access_token':'test-only-access','refresh_token':'test-only-refresh','expires_in':900,
    })
    with TestClient(app,base_url='https://cloux-messenger.onrender.com') as client:
        meta=client.get('/oauth/resend/client')
        assert meta.status_code==200
        assert meta.json()['client_id']==oauth.META
        assert meta.json()['client_uri']==oauth.BASE_URL
        assert meta.json()['scope']=='emails:send'
        assert meta.json()['client_id'] == oauth.META
        assert meta.json()['token_endpoint_auth_method'] == 'none'
        assert meta.json()['redirect_uris']==[oauth.CALLBACK]
        assert client.get('/admin/mail').status_code==200
        no=client.post('/api/admin/mail/start',json={'token':'bad-token'})
        assert no.status_code==403
        result=client.post('/api/admin/mail/start',json={'token':token})
        assert result.status_code==200,result.text
        url=urlsplit(result.json()['authorize_url'])
        assert url.netloc=='api.resend.com'
        params=parse_qs(url.query)
        assert params['scope']==['emails:send']
        assert params['code_challenge_method']==['S256']
        assert len(params['code_challenge'][0])>=43
        callback=client.get('/oauth/resend/callback',params={'code':'approved','state':params['state'][0]})
        assert callback.status_code==200
        assert oauth.connected()
        assert oauth.access_token()=='test-only-access'
        with db() as con:
            encrypted=con.execute('SELECT access,refresh FROM cloux_resend_oauth WHERE id=1').fetchone()
            assert 'test-only-access' not in encrypted['access']
            assert 'test-only-refresh' not in encrypted['refresh']
        assert client.post('/api/admin/mail/start',json={'token':token}).status_code==409
    with db() as con:
        con.execute('DELETE FROM cloux_resend_pending')
        con.execute('DELETE FROM cloux_resend_oauth')
        con.execute('UPDATE cloux_resend_provisioning SET used=0 WHERE id=1')
