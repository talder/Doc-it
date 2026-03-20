# Changelog

All notable changes to Doc-it are documented here.

---

## [0.2.0] — 2026-03-20

### Added
- **Backlinks in TOC sidebar** — "Linked from" references are now shown at the bottom of the Table of Contents panel instead of as a banner below the document. The TOC tab button shows a small accent dot when backlinks exist and the panel is closed.
- **Review request email notifications** — when a document is set to "Review" status and a reviewer is assigned, the reviewer now receives an email notification (requires SMTP to be configured).
- **Changelog viewer** — clicking the version number in the user menu now opens this changelog.

### Fixed
- **`LinkOff` icon import** — replaced the non-existent `LinkOff` lucide icon with the correct `Link2Off` in `LinkedDocExtension`.
- **Gray area below document** — a "Create or select a document" placeholder was always rendered alongside the editor due to a ternary logic bug, creating a large empty gray block beneath short documents.

---

## [0.1.1] — 2026-03-19

### Added
- Linked document extension (`LinkedDocExtension`) with inline, card, and embed view modes.
- Anchor linking support in linked docs with broken-anchor indicator.

### Fixed
- Various stability improvements to the TipTap editor extensions.

---

## [0.1.0] — 2026-03-01

### Added
- Initial release of Doc-it.
- Next.js 16 App Router with Turbopack.
- TipTap/ProseMirror editor with slash commands, callouts, Excalidraw, Draw.io, tables, task lists, code blocks, math (KaTeX), and more.
- SQLite-backed configuration store (no external database required).
- Markdown documents stored as `.md` files with YAML frontmatter.
- Per-space RBAC (reader / writer / admin roles).
- Cookie-based sessions and Bearer token API keys.
- AES-256-GCM field encryption for TOTP secrets, journals, audit logs, and backups.
- NIS2-compliant encrypted audit log with optional syslog forwarding.
- Helpdesk module with ticketing, SLA policies, rule engine, form designer, and portal page designer.
- Inline databases (table, kanban, gallery, calendar views).
- Encrypted personal and space journals.
- Asset registry and change log modules.
- Active Directory / LDAP authentication.
- TOTP two-factor authentication.
- Document revision history and archiving.
- Offline reader bundle export.
- Real-time presence awareness (multi-editor conflict warnings).
- Backups as AES-256-GCM encrypted `.tar.gz.enc` archives.
- Security incident email notifications (account lockout, login failures, rate limits).
- In-app and email notifications for mentions and new user registrations.
- Helpdesk email notifications for ticket assignment and agent replies.
- Multiple UI themes (light, dark, Dracula, Nord, Solarized, GitHub Dark, Catppuccin, and more).
