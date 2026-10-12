# Cloux Messenger

A mobile-first Liquid Glass messenger with React + TypeScript and a FastAPI server.

## Run locally

```bash
sh run.sh
```

Open http://127.0.0.1:10000/ after the first build.

New account registration is currently disabled. Existing users can sign in at `/download` → `/v5/` with their account email and separate Cloux password. Cloux never asks for a Gmail or other mailbox password. Passwords are stored with Argon2.

## Calls

One-to-one WebRTC audio/video and available screen sharing have working UI and authenticated signaling. Use `TURN_URL`, `TURN_USERNAME`, and `TURN_PASSWORD` for calls between NAT-restricted networks. Group SFU calls, mobile OS incoming-call notifications, and end-to-end encrypted content are not yet implemented.

## Platform delivery

- Web/PWA: open / or /v5/
- Android APK: /download (Android wrapper; uses current web frontend)
- macOS and iOS: Web/PWA; native packages are not published yet.
- Avoid storing sensitive information until persistent production hosting, safety auditing, and full testing are complete.
