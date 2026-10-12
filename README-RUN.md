# Cloux Messenger

A mobile-first Liquid Glass messenger with React + TypeScript and a FastAPI server.

## Run locally

```bash
sh run.sh
```

Open http://127.0.0.1:10000/ after the first build.

Registration at `/download` → `/v5/` asks for phone, email, and a separate Cloux password. Cloux never asks for or stores the password to a Gmail or other email account, and account creation does not depend on email delivery. Passwords are stored with Argon2. Sign in using the account email and Cloux password.

## Calls

One-to-one WebRTC audio/video and available screen sharing have working UI and authenticated signaling. Use `TURN_URL`, `TURN_USERNAME`, and `TURN_PASSWORD` for calls between NAT-restricted networks. Group SFU calls, mobile OS incoming-call notifications, and end-to-end encrypted content are not yet implemented.

## Platform delivery

- Web/PWA: open / or /v5/
- Android APK: /download (Android wrapper; uses current web frontend)
- macOS and iOS: Web/PWA; native packages are not published yet.
- Avoid storing sensitive information until persistent production hosting, safety auditing, and full testing are complete.
