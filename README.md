# Doc-it

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm_NC_1.0-blue)](LICENSE)
[![Inspired by Jotty](https://img.shields.io/badge/Inspired%20by-Jotty-orange?logo=github)](https://github.com/fccview/jotty)

A self-hosted, Confluence-like documentation platform built with Next.js, TipTap, and Tailwind CSS.

---

## Inspiration & Credits

Three applications have been the primary functional inspiration behind Doc-it — shaping its feature set, UX philosophy, and documentation workflow:

- **[Jotty](https://github.com/fccview/jotty)** by [@fccview](https://github.com/fccview) — a lightweight self-hosted note-taking app with a clean interface and file-based storage philosophy that directly inspired Doc-it's storage approach and simplicity.
- **[Confluence](https://www.atlassian.com/software/confluence)** by Atlassian — the industry benchmark for team documentation, which has led the way in spaces, structured page hierarchies, and collaborative workflows that Doc-it aims to replicate in a self-hosted form.
- **[Affine](https://affine.pro)** — a next-generation open-source knowledge base combining docs, whiteboards, and databases in a unified workspace, inspiring Doc-it's richer editor capabilities and embedded drawing/database features.

> ⭐ **[github.com/fccview/jotty](https://github.com/fccview/jotty)**

---

## Features

### Spaces & Organization
- **Spaces** — isolated documentation workspaces with role-based access (admin / writer / reader)
- **Categories** — nested folder structure within each space
- **Tags** — hierarchical `#tag` system with `#parent/child` support, inline tag linking, and tag-based filtering
- **Global Search** — `Cmd+K` / `Ctrl+K` search across documents, content, tags, changelog entries, assets, and helpdesk tickets with filters (category, tag, author, classification, date range), recent search history, and result snippets

### Editor
- **Rich text editing** powered by TipTap (ProseMirror) with bubble menu toolbar
- **Slash commands** (`/`) — headings H1–H4, lists, alignment, callouts, code blocks, tables, images, attachments, PDFs, drawings, diagrams, databases, linked docs, template fields, equations, emoji, date/time — sorted into logical groups
- **Table of Contents** — floating TOC panel (H1–H4) with resizable panel, always-show preference, and a persistent tab toggle on the page edge
- **Distraction-Free Mode** — full-screen writing mode that hides the sidebar, topbar, and all UI chrome; exit with `Esc` or the overlay button
- **Excalidraw** — embedded whiteboard drawings stored as assets
- **Draw.io** — embedded diagrams via iframe with SVG preview
- **Collapsible bullet lists** — Logseq-style collapse with bow connector lines
- **Code blocks** — syntax highlighting via lowlight with language labels and copy button
- **Callouts** — info, warning, success, danger blocks
- **Drag handle** — Notion-style block drag & drop
- **Formatting** — bold, italic, underline, strikethrough, highlight (multicolor), text color, font size, alignment, superscript/subscript, links

### Documents
- **Read / Edit mode** — toggle editing with pencil/check button
- **Autosave** — saves automatically while editing
- **Revision history** — file-based snapshots with diff/compare view and revert
- **Review workflow** — submit a document for review; reviewers are notified and can approve or request changes
- **Document classification** — label documents as Public, Internal, Confidential, or Restricted
- **Archive** — archive and restore documents
- **Move** — relocate documents between categories
- **Templates** — create reusable document templates with fillable fields; apply templates when creating new documents
- **Markdown storage** — all documents stored as `.md` files on disk

### Databases
- **Inline databases** — embed structured tables directly inside documents via `/database`
- **Custom schemas** — define columns with types: text, number, date, checkbox, select, multi-select, URL
- **Views** — switch between Table, Board (Kanban), and Gallery views per database
- **Filtering & sorting** — filter rows and sort by any column
- **Per-space storage** — each database is stored as JSON within its space, versioned with the space

### Journal
- **Personal journals** — per-user private journals with entries encrypted at rest (AES-256-GCM)
- **Space journals** — shared team journals within a space
- **Calendar view** — day-by-day calendar with entry previews and quick navigation
- **Templates** — reusable journal templates with default tags
- **Tagging & mood** — tag entries and attach emoji mood indicators
- **Pinning & filtering** — pin important entries; filter by date range, tag, search text
- **Export** — export journal entries as JSON

### Change Log
- **Operational change tracking** — log infrastructure and system changes with structured fields (system, category, risk, impact, status)
- **Auto-incrementing IDs** — CHG-0001, CHG-0002, etc.
- **Categories** — Disk, Network, Security, Software, Hardware, Configuration, Other
- **Risk levels** — Low, Medium, High, Critical
- **Linked documentation** — optionally link a changelog entry to a document in any space
- **Syslog forwarding** — change events forwarded to syslog (if enabled) with `[CHANGE]` marker
- **Filtering** — search and filter by date range, category, system name, and free text

### Asset Management
- **IT asset registry** — track hardware, software, and infrastructure assets
- **Auto-incrementing IDs** — AST-0001, AST-0002, etc.
- **Container tree** — organize assets in nested groups (racks, locations, departments)
- **Asset statuses** — Active, Maintenance, Decommissioned, Ordered
- **Custom field definitions** — define additional fields per install (text, number, date, boolean, select, URL)
- **CSV import** — bulk-import assets from CSV files
- **Sortable table** — sort by name, type, status, location, owner; full-text search across all fields

### Helpdesk & Ticketing
- **Full ticketing system** — create, assign, and track support tickets with statuses (Open, In Progress, Waiting, Resolved, Closed) and priorities (Low, Medium, High, Critical)
- **Support groups** — organize agents into teams with email routing
- **Categories** — classify tickets by type with icons and ordering
- **Custom fields** — define additional ticket fields (text, number, date, boolean, select, multiselect, textarea, URL, email)
- **Form designer** — build custom ticket submission forms with drag-and-drop field ordering, per-category filtering, and half/full width layout
- **Rule engine** — automated ticket routing rules with conditions (match all/any) and actions (assign group, set priority, send notification, add tag, etc.) with stop-on-match support
- **SLA policies** — define response and resolution time targets per priority with business hours configuration
- **Ticket comments** — agent and portal user comments with internal notes and file attachments
- **Email notifications** — automatic notifications on ticket creation and status changes

### Portal & Public Pages
- **Self-service portal** — external users register and log in to submit and track their tickets at `/portal`
- **Portal Page Designer** — drag-and-drop page builder with 9 widget types: Hero, Ticket Form, My Tickets, Announcements, FAQ, Categories, Search, Custom HTML, Quick Links
- **Per-widget configuration** — each widget has a config modal for titles, content, colours, and layout (full / half / third width)
- **Publish / Unpublish** — control which portal pages are public with a toggle; unpublished pages are only visible to admins
- **Public portal listing** — browse published portal pages at `/portals` with links to `/portals/[slug]`
- **Portal user authentication** — separate auth system for portal users with session management

### Users & Auth
- **Session-based authentication** with cookie sessions and idle timeout (NIS2)
- **TOTP multi-factor authentication** — time-based one-time passwords with QR code setup, backup codes, and admin-forced enrollment
- **bcrypt password hashing** — automatic migration from legacy SHA-256 hashes; configurable bcrypt rounds
- **Password policy** — password history enforcement to prevent reuse
- **Account lockout** — brute-force protection with configurable lockout thresholds
- **User self-registration** — new users register and see a pending access screen until an admin assigns them to a space
- **User profiles** — change full name, email, password, avatar, editor preferences (line spacing, font size, TOC, accent colour)
- **API Keys** — personal user keys (`dk_u_`) and admin-managed service keys (`dk_s_`) with per-space permissions, expiry dates, and a one-time secret reveal
- **Admin panel** — manage users, spaces, permissions, SMTP settings, service API keys, backups, and audit logs
- **SMTP email** — configurable email notifications (e.g. admin notified on new registration)

### NIS2 Audit Logging
- **34 event types** covering authentication, document changes, user management, space operations, API key lifecycle, and settings changes
- **Encrypted audit logs** — AES-256-GCM encryption of log entries at rest
- **Tamper-proof chain** — HMAC integrity chain for log verification
- **JSONL audit log files** — one file per day under `logs/audit-YYYY-MM-DD.jsonl`, retained for a configurable number of days
- **Syslog forwarding** — optional UDP or TCP syslog (RFC 5424) to a remote SIEM or log collector
- **Admin Audit tab** — calendar heatmap showing event volume, event explorer with filtering, and one-click CSV/JSON export
- **Audit settings API** — configure retention period and syslog target without restarting the service

### Backup & Recovery
- **Encrypted backups** — AES-256-GCM encrypted `.tar.gz.enc` archives of all data directories (config, docs, logs, archive, history)
- **Backup targets** — local path (covers pre-mounted NFS shares) and CIFS/SMB remote shares via `smbclient`
- **Scheduling** — manual or automated backups with configurable time and day-of-week
- **Retention policy** — configurable retention count; old backups pruned automatically
- **Restore** — decrypt and restore from any backup archive via the admin panel
- **Encryption key rotation** — rotate the field-encryption key with automatic re-encryption of all TOTP secrets, CIFS passwords, and backup archives

### Theming & Personalisation
- **17 themes** — Light, Solarized Light, Dracula Light, Catppuccin Latte, Paper, High Contrast, Dark, Dracula, Nord, Solarized Dark, GitHub Dark, Catppuccin Mocha, Twilight, Midnight Rose, and High Contrast Dark
- 🌸 **Lady themes** — Blossom (blush pink) and Lavender (soft purple) light themes, plus Twilight and Midnight Rose dark themes, for those who like a bit of colour in their workflow
- **Accent colour picker** — 7 curated accent presets (Blue, Indigo, Violet, Rose, Orange, Green, Teal) plus a theme-default option, synced to your user profile across devices
- **Editor font size** — Small, Normal, Large, X-Large — configurable per user
- Theme and accent preference are saved to your profile and applied instantly on login

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Runtime**: Node.js 24 LTS
- **UI Library**: React 19
- **Editor**: TipTap / ProseMirror
- **Styling**: Tailwind CSS 4
- **Language**: TypeScript 5.9
- **Icons**: Lucide React
- **Markdown**: marked (parse) + turndown (serialize)
- **Drawing**: Excalidraw + Draw.io
- **Email**: Nodemailer
- **Database**: SQLite via better-sqlite3 (WAL mode) — config data stored in a key-value table
- **Storage**: Markdown documents on disk; configuration data in SQLite (`config/docit.db`)
- **Encryption**: AES-256-GCM for audit logs, journal entries, backup archives, and TOTP secrets
- **Auth**: bcrypt password hashing, TOTP MFA via otpauth

## Installation

Installer scripts handle all prerequisites (Homebrew / apt / winget, git, Node.js 24) and clone the repo automatically. Run the script for your platform:

### macOS (Apple Silicon & Intel)

```bash
bash install-mac.sh
```

### Ubuntu / Debian Linux

```bash
bash install-linux.sh
```

### Windows (PowerShell — run as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

On first launch, open [http://localhost:3000/setup](http://localhost:3000/setup) to create the initial admin account.

### Installer options (all platforms)

| Flag | Description |
|---|---|
| `--upgrade` / `-Upgrade` | Pull latest from GitHub, reinstall deps, rebuild |
| `--force` / `-Force` | Override an existing Node.js version conflict |
| `--no-ssl` / `-NoSsl` | Disable SSL verification (corporate proxies) |
| `--service` / `-Service` | Install as a system service (launchd / systemd / Windows Service) |
| `--check` / `-Check` | Run preflight checks only — do not install |
| `--dir` / `-Dir` | Override install directory (default: `/opt/doc-it` or `C:\doc-it`) |

**Service details by platform:**
- macOS — launchd daemon at `/Library/LaunchDaemons/com.talder.docit.plist` (auto-start at boot)
- Linux — systemd unit `/etc/systemd/system/doc-it.service`, runs as `doc-it` system user
- Windows — Windows Service via NSSM with **delayed auto-start**; logs at `<dir>\logs\service.log`

**If another Node.js is already installed**, the script blocks and shows the `--force` hint:

```bash
bash install-mac.sh --force
# or
bash install-linux.sh --force
# or
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Force
```

### Upgrading

```bash
# macOS
bash install-mac.sh --upgrade

# Linux
bash install-linux.sh --upgrade

# Windows (PowerShell as Administrator)
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Upgrade
```

The upgrade path stops any running service, runs `git pull --rebase`, reinstalls dependencies, rebuilds, and restarts the service.

### Manual Install

If you prefer to install manually:

```bash
git clone https://github.com/talder/doc-it.git
cd doc-it
npm install
npm run dev        # development
npm run build && npm start  # production
```

Requires Node.js 24+ and npm 10+.

## Project Structure

```
config/              # SQLite database (docit.db) + avatars
  docit.db           # SQLite KV store for all config data (WAL mode)
  avatars/           # User avatar images
docs/                # Document storage (docs/{space}/{category}/{doc}.md)
archive/             # Archived documents
history/             # Revision snapshots
backups/             # Encrypted backup archives (.tar.gz.enc)
logs/                # Audit log files (audit-YYYY-MM-DD.jsonl)
src/
  app/
    api/             # API routes (auth, spaces, docs, settings, assets,
                     #   helpdesk, portal, journal, changelog, audit, backup)
    admin/           # Admin panel
    assets/          # Asset management page
    changelog/       # Change log page
    helpdesk/        # Helpdesk agent UI + admin config
    journal/         # Personal & space journal
    portal/          # Self-service portal (login, register, tickets)
    portals/         # Public portal listing & pages
    login/           # Login page
    register/        # Registration page
    profile/         # User profile page
    setup/           # First-time setup
    page.tsx         # Main app (editor + sidebar)
  components/
    extensions/      # TipTap extensions (slash commands, callouts, excalidraw,
                     #   draw.io, collapsible lists, drag handle, tags, etc.)
    helpdesk/        # Helpdesk components (WidgetRenderer, PortalPageDesigner)
    modals/          # Modal dialogs
    sidebar/         # Sidebar with categories, docs, tags
    Editor.tsx       # Main editor component
    Topbar.tsx       # Top navigation bar
    SearchModal.tsx  # Global search (Cmd+K)
  lib/
    auth.ts          # Authentication (bcrypt, sessions, TOTP)
    config.ts        # SQLite-backed config read/write
    helpdesk.ts      # Helpdesk module (tickets, groups, SLA, rules, forms, portal pages)
    helpdesk-portal.ts # Portal user auth (separate from main auth)
    assets.ts        # Asset management module
    changelog.ts     # Change log module
    journal.ts       # Journal module (encrypted user journals)
    audit.ts         # NIS2 audit logging (encrypted, syslog)
    backup.ts        # Backup & restore (AES-256-GCM encrypted archives)
    crypto.ts        # Field encryption & key management
    key-rotation.ts  # Encryption key rotation
    permissions.ts   # Space role-based access control
    email.ts         # Nodemailer SMTP utilities
    types.ts         # TypeScript type definitions
```

## Configuration

All configuration is stored in a SQLite database at `config/docit.db` using a key-value table. On first startup, any existing JSON files in the `config/` directory are automatically migrated into the database.

Key configuration entries (stored as JSON values):

- `users.json` — user accounts (bcrypt hashes, TOTP secrets)
- `sessions.json` — active sessions
- `spaces.json` — spaces and permissions
- `smtp.json` — SMTP email settings (configurable in Admin → Settings)
- `helpdesk.json` — helpdesk configuration (groups, categories, fields, forms, rules, SLA, portal pages)
- `helpdesk-tickets.json` — ticket storage
- `assets.json` — asset registry
- `changelog.json` — change log entries
- `audit.json` — audit configuration
- `backup.json` — backup configuration and targets

Avatars are stored in `config/avatars/`.

## License

Licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

Free to use, modify, and self-host for **non-commercial** purposes. Commercial use requires a separate license — contact the project maintainer.
