# Cloux — Stage 1

This is an independent React + TypeScript client preview at **/v5/**. It does not overwrite the existing stable home page.

Features in stage 1:
- Liquid Glass responsive mobile/desktop layout and bottom navigation
- iMessage-inspired teal chat bubbles, message composer, attachments, basic actions
- Ukrainian multi-step enrollment wizard with country list and libphonenumber validation
- Twilio Verify SMS start/confirm via backend, with an honest unavailable state until provisioned
- Password strength checklist and Argon2 password storage for verified registrations
- Theme, accent, local wallpaper presets, emoji style controls

**Required environment variables to enable SMS**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`. After confirming Twilio Verify production readiness, optionally set `CLOUX_REQUIRE_SMS=1` to disable legacy unchecked registrations. Never place these credentials in the repository.

Existing chats and accounts continue using the existing backend, currently backed by ephemeral SQLite. Persistent DB, WebSocket real-time delivery, SFU group calling and app store releases belong to later stages. Do not claim an unreleased SMS service works.

The uploaded photo 1 is a screenshot of the bottom bar including a tiny user avatar, not an independent original avatar file; the previously uploaded full-size Cloux icon is reused unchanged at `/assets/cloux-default-avatar.jpg`. Reference screenshots should not be used as avatar crops.