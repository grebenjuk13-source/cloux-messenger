import os
import tempfile
import importlib

os.environ['CLOUX_DATA']=tempfile.mkdtemp(prefix='cloux_stage1_test_')
from main import app, requests_by_ip
from fastapi.testclient import TestClient
from cloux_stage1 import password_issues, phone_e164, PASSWORD_HASHER


def test_mobile_stage1_capabilities_and_guardrails():
    requests_by_ip.clear()
    with TestClient(app,base_url='https://testserver') as client:
        assert client.get('/api/v5/config').status_code==200
        assert client.get('/api/v5/username?username=abc').json()['valid'] is False
        assert phone_e164('+380671234567')=='+380671234567'
        assert client.post('/api/v5/sms/send',json={'phone':'+380671234567'}).status_code==503
        assert client.post('/api/v5/sms/check',json={'phone':'+380671234567','code':'123456'}).status_code==503
        assert client.post('/api/v5/register',json={'grant':'a'*50,'username':'myuser','display':'Hello','password':'Strong@Pass123'}).status_code==401
        from pathlib import Path
        # Backend CI runs independently of the React build.
        if Path('frontend_dist/index.html').is_file():
            assert client.get('/v5/').status_code==200


def test_password_rules_and_hash_verification():
    assert not password_issues('Hard@Pass2588','+380671234567','moon_player')
    assert 'no_personal' in password_issues('moon_player@A12','+380671234567','moon_player')
    stored=PASSWORD_HASHER.hash('Strong@Pass123')
    from main import check_password
    assert check_password('Strong@Pass123',stored)
    assert not check_password('wrong',stored)