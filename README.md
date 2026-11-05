# CLOUX — Element Web

CLOUX is now deployed using the official, unmodified Element Web container.

- Upstream source: https://github.com/element-hq/element-web
- Upstream documentation: https://web-docs.element.dev/install.html
- Container: `ghcr.io/element-hq/element-web:v1.12.33`
- Web client brand: CLOUX
- Default Matrix homeserver: `matrix.org`

## Accounts and messages

This deployment uses Matrix, not the previous CLOUX account or messaging backend. Existing CLOUX accounts, messages, and contacts are not migrated. Users sign in with or create Matrix accounts on the selected homeserver.

The default homeserver is the public Matrix.org service. It is operated separately from CLOUX. To use a private CLOUX community server, configure and secure a Matrix homeserver first, then update `config.json` with its client API URL and server name.

## Calls

Element's call interface is included. Actual voice/video availability depends on the selected homeserver's MatrixRTC/Element Call infrastructure, browser permissions, and HTTPS. This repository change alone does not provision a Matrix homeserver or call media infrastructure.

## License and attribution

Element Web is a project of Element (New Vector Ltd.) and is available under the licenses described by the upstream project. See [Element Web](https://github.com/element-hq/element-web), the included `LICENSE-AGPL-3.0`, and upstream licensing files for the complete terms. CLOUX is not the owner of Element Web.
