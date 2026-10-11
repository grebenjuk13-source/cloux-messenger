FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py index.html cloux_features.py cloux-plus.js cloux_calls.py cloux-v2.js manifest.webmanifest sw.js cloux-icon.svg download.html ./
COPY assets/ ./assets/
ENV PYTHONUNBUFFERED=1 CLOUX_DATA=/tmp/cloux
EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --proxy-headers --forwarded-allow-ips 127.0.0.1"]
