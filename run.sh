#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  cp .env.example .env
  python3 - <<'PY'
from pathlib import Path
import secrets
p=Path(".env")
text=p.read_text()
text=text.replace("CLOUX_EMAIL_PEPPER=","CLOUX_EMAIL_PEPPER="+secrets.token_urlsafe(48),1)
p.write_text(text)
PY
  chmod 600 .env
fi
docker compose up --build
