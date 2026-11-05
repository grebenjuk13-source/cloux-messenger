# CLOUX — Element-inspired integration notes

This branch adds an original CLOUX presentation layer inspired by Element Web's room-first workspace, compact room list, left navigation rail, neutral surfaces, and accessible active states.

## What changed
- Added `frontend/src/cloux-element.css`.
- Imported it after the existing CLOUX styles in `frontend/src/main.tsx`.
- Existing CLOUX APIs, authentication, database, chats, groups, calls, communities, profiles, and media components are not replaced.
- Desktop gets a narrow navigation rail, room list, and main content layout.
- Mobile keeps a bottom navigation bar and a single-column layout.

## Important distinction
This is not a copy of Element's source code. Element Web is a separate Matrix client and its repository is multi-licensed (AGPL-3.0, GPL-3.0, or a commercial license). Reusing Element source requires complying with the selected license, including notices and applicable source-sharing obligations. This branch uses original CSS and existing CLOUX components instead.

Upstream project: https://github.com/element-hq/element-web
License details: https://github.com/element-hq/element-web#copyright--license

## Test
From the repository's frontend directory:
```sh
npm install
npm run build
```
