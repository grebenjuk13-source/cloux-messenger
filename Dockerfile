FROM node:22-alpine AS cloux_client
WORKDIR /client
COPY frontend/package.json frontend/tsconfig.json frontend/vite.config.ts frontend/index.html ./
COPY frontend/src/ ./src/
RUN npm install --no-audit --no-fund && npm run build

FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py cloux_multiaccounts.py cloux_db.py index.html modern.html cloux_social.py cloux_preferences.py cloux_auth.py cloux_admin.py cloux_features.py cloux-plus.js cloux_calls.py cloux_realtime.py cloux_messages.py cloux_media.py cloux-v2.js cloux-v3.js cloux-media.js manifest.webmanifest sw.js cloux-icon.svg download.html ./
COPY assets/ ./assets/
COPY offline/ ./offline/
COPY ui/ ./ui/
COPY --from=cloux_client /client/dist ./frontend_dist
ENV PYTHONUNBUFFERED=1 CLOUX_DATA=/tmp/cloux
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1 --no-access-log"]
