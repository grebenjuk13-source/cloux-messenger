# CLOUX REDLINE — frontend direction

This branch is the safe visual foundation for a Telegram-inspired CLOUX interface while retaining Matrix as the messaging protocol and account/session layer.

## Product direction
- Brand: CLOUX / REDLINE
- Visual reference: familiar Telegram-style information architecture, implemented with original CLOUX styling and assets.
- Palette: near-black `#0A0A0A`, surfaces `#101010` / `#1A1A1A`, red accent `#E10600`, primary text `#F5F5F5`, secondary text `#A1A1AA`.
- Typography: Inter/system sans-serif.
- Responsive: desktop three-pane layout; tablet two-pane layout; mobile single-pane navigation.
- Accessibility: visible focus, keyboard navigation, reduced-motion support, adequate contrast.

## Main application layout
1. Navigation rail: Chats, Contacts, Calls, Settings; unread indicators.
2. Conversation list: search, filters (All / Personal / Groups / Channels), pinned conversations, unread count, mute indicator, draft preview, last message and time.
3. Conversation view: header with avatar, display name, presence, search-in-chat, call actions and overflow menu; message timeline with date separators, replies, reactions, edited state, delivery/read state; composer with attachment, emoji, voice and send controls.
4. Details drawer: profile, members, shared media/files/links, notification and privacy controls.

## Required screens
- Sign in / sign up / session verification
- Chats and direct messages
- Groups and channels
- Contacts and user profile
- Calls and call history
- Global search and in-chat search
- Settings: appearance, notifications, privacy, devices/sessions, language and accessibility

## Matrix integration requirements
- Keep Matrix client authentication and encrypted-room support.
- Use Matrix room, event, sync, media and call APIs through the Element/Matrix SDK.
- Do not create a parallel local message store or fake delivery/read receipts.
- Preserve room IDs, event IDs, encryption state, pagination, edits, replies, reactions, typing and read markers.
- Calls must use supported MatrixRTC/Element Call infrastructure; UI alone cannot provision call infrastructure.

## Implementation boundary
The current repository is a Docker wrapper around the prebuilt upstream Element Web image. A custom Telegram-like information architecture requires building a maintained Element Web source fork (or a supported SDK-based client), not just changing `config.json`. The current commit adds the supported REDLINE theme foundation without replacing the production branch or pretending that a full custom client has already been implemented.
