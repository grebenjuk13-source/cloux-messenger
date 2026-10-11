# Cloux · Gmail email verification (stage 1 / stage 2)

The existing Cloux backend is **FastAPI/Python**. Email is sent server-side using **Resend HTTPS** (recommended) or Gmail **SMTP_SSL** via Python's `smtplib` (functionally equivalent to Nodemailer SMTP). No secrets or OTPs are shipped to the React client.

## Render environment variables (secrets, do not commit)

Required in either case:

- `CLOUX_EMAIL_PEPPER`: a cryptographically random secret, at least 32 characters; keep stable across restarts.
- `CLOUX_EMAIL_PROVIDER`: `resend` or `smtp`.

Resend:
- `RESEND_API_KEY`
- `CLOUX_EMAIL_FROM` e.g. `Cloux <noreply@your-verified-domain.example>`. The sender domain must be verified in Resend.

Gmail SMTP (only development/testing):
- `GMAIL_SMTP_USER`: Gmail sender account
- `GMAIL_SMTP_APP_PASSWORD`: Google App Password (never normal Google password).

The frontend calls `GET /api/v6/config`, which enables **Send code** only when a provider and pepper are configured. Unconfigured production does **not** email fake codes or issue unverified sessions.

## Workflow
- `POST /api/v6/email/send`: Gmail/googlemail only; 6-digit OTP, HMAC hash in SQLite, 10-minute expiry, 60-second resend, 5 sends/hour/address and 5 sends/hour/IP.
- `POST /api/v6/email/verify`: 5 failed attempts max, 15-minute lockout, consumes code atomically, issues short-lived one-time grant.
- `POST /api/v6/register`: requires verified email grant, valid profile-only phone number (no SMS), Argon2 password, unique Gmail account and username.
- `POST /api/v6/login`: verified Gmail only. Existing *legacy* phone accounts can still use `/api/login` for compatibility.
- `POST /api/v6/password/reset`: requires one-time Gmail recovery grant and invalidates all sessions.
- UI is available at `/v5/`; current main Cloux UI remains separate until promotion.

## Safety / hosting limitations

Render Free has **ephemeral storage**: SQL database, email grants, locks, registration identities and messages can be lost when it restarts. Before using this with real users: migrate DB and rate limits to persistent Postgres/Redis and files to durable object storage, test actual SMTP/Resend delivery, set up monitoring, DKIM/SPF and domain reputation, then promote to production.

**Do not set `CLOUX_REQUIRE_EMAIL=1` until the provider is configured and migration of legacy registrations is planned.** When provider is configured, old unchecked `/api/register` is disabled automatically for new signups.

No secrets, six-digit codes, user addresses or passwords should be logged.
