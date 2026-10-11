# Cloux Messenger

A mobile-first Liquid Glass messenger with React + TypeScript and a FastAPI server.

## Run locally

```bash
sh run.sh
```

Open http://127.0.0.1:10000/ after the first build.

This creates a persistent Docker volume for SQLite and uploaded media. Without a configured email provider, the Gmail verification UI correctly disables registration; it **does not issue a fake verification code**.

## Gmail OTP registration

Fill `.env` with a random `CLOUX_EMAIL_PEPPER` and either:

- Resend: `CLOUX_EMAIL_PROVIDER=resend`, `RESEND_API_KEY` and verified `CLOUX_EMAIL_FROM`
- Gmail SMTP: `CLOUX_EMAIL_PROVIDER=smtp`, `GMAIL_SMTP_USER`, `GMAIL_SMTP_APP_PASSWORD` (an App Password, not your Google password)

Restart with `sh run.sh` after configuring email. Gmail addresses are normalized for dot/plus aliases; a verified email is required before issuing a session. Code validity: 10 minutes, maximum 5 attempts, lockout 15 minutes, resend cooldown 60 seconds and 5 send requests per hour/email/IP. OTP digests and passwords are stored as HMAC-SHA256 and Argon2 respectively.

## Calls

One-to-one WebRTC audio/video and available screen sharing have working UI and authenticated signaling. Use `TURN_URL`, `TURN_USERNAME`, and `TURN_PASSWORD` for calls between NAT-restricted networks. Group SFU calls, mobile OS incoming-call notifications, and end-to-end encrypted content are not yet implemented.

## Platform delivery

- Web/PWA: open / or /v5/
- Android APK: /download (Android wrapper; uses current web frontend)
- macOS and iOS: Web/PWA; native packages are not published yet.
- Avoid storing sensitive information until persistent production hosting, safety auditing, and full testing are complete.
