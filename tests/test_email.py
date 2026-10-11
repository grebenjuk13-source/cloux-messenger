"""Email auth regression tests. Mail delivery is mocked, NEVER simulated in production."""
import os
import tempfile
os.environ['CLOUX_DATA'] = os.getenv('CLOUX_DATA', tempfile.mkdtemp(prefix='cloux_email_test_'))

from fastapi.testclient import TestClient
from main import app, db, requests_by_ip
import cloux_email

EMAIL='cloux.email.test+one@gmail.com'
STRONG='Strong^Tiger298'


def test_validation_and_password_rules():
    assert cloux_email.valid_gmail('abc@gmail.com')
    assert cloux_email.valid_gmail('ab.c+tag@googlemail.com')[1] == 'abc@gmail.com'
    assert not cloux_email.valid_gmail('someone@outlook.com')
    assert not cloux_email.valid_gmail('not@evilgmail.com')
    assert not cloux_email.valid_gmail('bad..dots@gmail.com')
    assert not cloux_email.password_problems(STRONG,EMAIL,'magic_user')
    assert cloux_email.password_problems('magic_user#Ab123',EMAIL,'magic_user')


def test_no_provider_fails_closed(monkeypatch):
    monkeypatch.delenv('CLOUX_EMAIL_PEPPER',raising=False)
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as client:
        assert client.get('/api/v6/config').json()['email_enabled'] is False
        r=client.post('/api/v6/email/send',json={'email':EMAIL})
        assert r.status_code==503


def test_verified_registration_and_recovery(monkeypatch):
    monkeypatch.setenv('CLOUX_EMAIL_PEPPER','p'*48)
    monkeypatch.setattr(cloux_email,'email_ready',lambda: True)
    mailed=[]
    monkeypatch.setattr(cloux_email,'send_email',lambda address, code, purpose: mailed.append((address,code,purpose)))
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as a:
        assert a.get('/api/v6/config').json()['email_enabled'] is True
        assert a.post('/api/v6/email/send',json={'email':'x@example.com'}).status_code==400
        r=a.post('/api/v6/email/send',json={'email':EMAIL})
        assert r.status_code==200,r.text
        code=mailed[-1][1]
        with db() as conn:
            row=conn.execute('SELECT digest FROM cloux_email_codes WHERE purpose=?',('register',)).fetchone()
            assert row and row['digest']!=code and len(row['digest'])==64
        assert a.post('/api/v6/email/send',json={'email':EMAIL}).status_code==429
        assert a.post('/api/v6/login',json={'email':EMAIL,'password':STRONG}).status_code==403
        bad=a.post('/api/v6/email/verify',json={'email':EMAIL,'code':'123999'})
        assert bad.status_code==401
        verified=a.post('/api/v6/email/verify',json={'email':EMAIL,'code':code})
        assert verified.status_code==200,verified.text
        grant=verified.json()['grant']
        assert a.post('/api/v6/email/verify',json={'email':EMAIL,'code':code}).status_code==401
        payload={'email':EMAIL,'grant':grant,'phone':'+380671238471','username':'email_test_one','display':'Email Test','password':STRONG}
        badreg=a.post('/api/v6/register',json={**payload,'password':'weak'})
        assert badreg.status_code in (400,422)
        created=a.post('/api/v6/register',json=payload)
        assert created.status_code==200,created.text
        assert a.get('/api/me').status_code==200
        assert a.post('/api/v6/register',json=payload).status_code==401
        with db() as conn:
            row=conn.execute('SELECT e.verified,u.password_hash FROM cloux_email_identity e JOIN users u ON e.uid=u.id WHERE e.key=?',(cloux_email.valid_gmail(EMAIL)[1],)).fetchone()
            assert row['verified']==1 and row['password_hash'].startswith('$argon2')
        a.post('/api/logout',json={})
        assert a.post('/api/v6/login',json={'email':'clouxemailtest@googlemail.com','password':STRONG}).status_code==200
        assert a.post('/api/v6/email/send',json={'email':EMAIL}).status_code==409
        # Recovery uses a separate purpose and one-time verified grant.
        request=a.post('/api/v6/email/send',json={'email':EMAIL,'purpose':'recovery'})
        assert request.status_code==200,request.text
        reset_code=mailed[-1][1]
        check=a.post('/api/v6/email/verify',json={'email':EMAIL,'purpose':'recovery','code':reset_code})
        assert check.status_code==200
        assert check.json().get('username')=='email_test_one'
        reset=a.post('/api/v6/password/reset',json={'email':EMAIL,'grant':check.json()['grant'],'password':'Other@Strong914'})
        assert reset.status_code==200,reset.text
        assert a.get('/api/me').status_code==401
        assert a.post('/api/v6/login',json={'email':EMAIL,'password':STRONG}).status_code==401
        assert a.post('/api/v6/login',json={'email':EMAIL,'password':'Other@Strong914'}).status_code==200


def test_five_wrong_codes_lockout(monkeypatch):
    monkeypatch.setenv('CLOUX_EMAIL_PEPPER','p'*48)
    monkeypatch.setattr(cloux_email,'email_ready',lambda: True)
    mailed=[]
    monkeypatch.setattr(cloux_email,'send_email',lambda e,c,p:mailed.append((e,c,p)))
    requests_by_ip.clear()
    mail='lockout+one@gmail.com'
    with TestClient(app,base_url='https://testserver') as a:
        assert a.post('/api/v6/email/send',json={'email':mail}).status_code==200
        code=mailed[-1][1]
        wrong='999999' if code!='999999' else '888888'
        for _ in range(5):
            assert a.post('/api/v6/email/verify',json={'email':mail,'code':wrong}).status_code==401
        assert a.post('/api/v6/email/verify',json={'email':mail,'code':code}).status_code==429
        assert a.post('/api/v6/email/send',json={'email':mail}).status_code==429