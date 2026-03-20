# Changelog

All notable changes to Doc-it are documented here.

---

## [0.2.11] — 2026-03-20

### Added
- **Global content-addressed blobstore** — all uploaded attachments are stored by SHA-256 hash under `config/blobstore/`. Identical files are stored once regardless of how many documents reference them, saving significant disk space.
- **Duplicate file detection** — uploading a file with identical content shows an inline dialog to choose between the existing filename or your new one. The chosen name is applied system-wide to all existing references immediately.
- **PDF full-text search** — text-layer PDFs have their content extracted on upload using `pdfjs-dist`. Global search now returns PDF attachment matches with text snippets.
- **Blobstore migration** — admin API endpoint to migrate all legacy attachment files into the blobstore. Runs async, reports progress, deletes originals after successful registration. Existing document URLs are preserved.
- **Real-time notifications** — the topbar bell updates instantly via the `/api/system/events` SSE channel. No page refresh required.
- **Graceful shutdown warning** — SIGTERM triggers a 4-second grace period. Connected browser tabs receive a warning via SSE and any open document is autosaved before the server exits.
- **Offline bundle lazy decryption** — PDFs and attachments are now encrypted individually in the offline bundle and decrypted on-demand in the browser. Bundle unlock time drops from ~10–30 s to under 1 s for large documentation sets. Download button decrypts and saves each file separately.
- **Backlinks in TOC sidebar** — "Linked from" references shown at the bottom of the Table of Contents panel. The tab button shows an accent dot when backlinks exist.
- **Review request email** — assigned reviewers receive an email when a document is set to Review status (SMTP required).
- **Release notes modal** — clicking the version number in the user menu opens this changelog.

### Fixed
- **Installer upgrade reliability** — `--upgrade` now uses `git fetch + reset --hard` to discard local version-bump changes, resolves the Git "dubious ownership" error, runs `npm build` as the service user to prevent root-owned `.next/` files, runs a second `chown -R` after build, and auto-restarts the service.
- **Installer preflight** — checks and reports wrong file ownership on `config/`, `docs/`, `history/`, `.next/` before upgrading; auto-corrects during the upgrade.
- **Gray area below document** — a placeholder `div` was always rendered alongside the editor due to a ternary logic bug.
- **`LinkOff` icon import** — replaced non-existent `LinkOff` with `Link2Off` in `LinkedDocExtension`.
- **`offline.bundle.requested` audit event type** — missing enum value added to `AuditEventType`.

---

## [0.2.0] — 2026-03-20

### Added
- Backlinks in TOC sidebar.
- Review request email notifications.
- Changelog viewer in user menu.

### Fixed
- `LinkOff` → `Link2Off` icon import.
- Gray area below short documents.

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
