<p align="center">
  <img src="public/logo.png" alt="Doc-it" width="200" />
</p>

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![License: PolyForm NC](https://img.shields.io/badge/License-PolyForm_NC_1.0-blue)](LICENSE)

A self-hosted documentation platform built with Next.js, TipTap, and Tailwind CSS for IT departments.

---

## Features

### Spaces & Organization
- **Spaces** — isolated documentation workspaces with role-based access (admin / writer / reader)
- **Categories** — nested folder structure within each space
- **Tags** — hierarchical `#tag` system with `#parent/child` support, inline tag linking, and tag-based filtering
- **Global Search** — `Cmd+K` / `Ctrl+K` search across documents, content, tags, changelog entries, assets, PDF attachment content, and helpdesk tickets with filters (category, tag, author, classification, date range), recent search history, and result snippets

### Editor
- **Rich text editing** powered by TipTap (ProseMirror) with bubble menu toolbar
- **Slash commands** (`/`) — headings H1–H4, lists, alignment, callouts, code blocks, tables, images, attachments, PDFs, drawings, diagrams, enhanced tables, linked docs, template fields, equations, emoji, date/time, table of contents — sorted into logical groups
- **Inline Table of Contents** — `/toc` slash command inserts a live, auto-updating TOC block with clickable entries. Optional "Number headings" toggle adds hierarchical numbering (1., 1.1, 1.1.1) via CSS counters
- **Sidebar Table of Contents** — floating TOC panel (H1–H4) with resizable panel, always-show preference, and a persistent tab toggle on the page edge
- **Document title field** — dedicated editable title at the top of every document, synced with the filename. Click to rename; triggers file rename on save
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
- **Review workflow** — submit a document for review; assigned reviewers receive an email notification and can approve or request changes
- **Document classification** — label documents as Public, Internal, Confidential, or Restricted
- **Category landing page** — clicking a category in the sidebar shows a full-page overview with doc count, stats, collapsible subcategories, and a detailed document table (name, tags, status, creator, dates) plus enhanced tables
- **Archive** — archive and restore documents
- **Move** — relocate documents between categories
- **Templates** — create reusable document templates with fillable fields; apply templates when creating new documents
- **Markdown storage** — all documents stored as `.md` files on disk
- **Global blobstore** — all uploaded attachments deduplicated by SHA-256 hash; identical files stored once in `config/blobstore/`. Duplicate uploads show an inline dialog to choose the canonical filename (applied system-wide). PDFs with a text layer are indexed for full-text search.
- **Offline reader bundle** — export a self-contained, passphrase-protected HTML reader. PDFs and attachments are individually encrypted and decrypted on-demand in the browser, keeping unlock time under 1 second regardless of bundle size.

### Enhanced Tables
- **Inline enhanced tables** — embed structured tables directly inside documents via the `/` slash command
- **Custom schemas** — define columns with types: text, number, date, checkbox, select, multi-select, URL, email, member, created-by
- **Views** — switch between Table, Board (Kanban), Calendar, and Gallery views per table
- **Column drag-and-drop reorder** — drag columns by the grip handle to rearrange them
- **Column header sorting** — click any column header to cycle unsorted → ascending → descending
- **Stable row numbers** — row numbers reflect insertion order, not display position
- **Filtering & sorting** — filter rows and sort by any column via toolbar controls
- **Tags** — enhanced tables support tags with the same add/remove/rename/delete behaviour as document tags; tags appear in the sidebar tag view and global tag index
- **Per-space storage** — each enhanced table is stored as JSON within its space, versioned with the space

### Enhanced Tables — Performance Guidelines

Each enhanced table is stored as a single JSON file (`docs/{space}/.databases/{id}.db.json`). Every read or write operation loads and saves the entire file. This is fast for typical IT documentation use cases but has practical limits:

| Metric | Comfortable | Workable | Starts to degrade |
|---|---|---|---|
| Rows | Up to 2,000 | Up to 5,000 | 10,000+ |
| Columns | Up to 25 | Up to 40 | 50+ |
| File size | Up to 2 MB | Up to 5 MB | 10 MB+ |

**Tips for best performance:**
- Keep tables under 2,000 rows for snappy inline editing
- Split large datasets across multiple tables (e.g. by year or category)
- Use views with filters to limit visible rows rather than loading everything
- CSV export is available for archiving or analysing large datasets externally

### On-Call Reports
- **On-call logging** — log on-call incidents with date, time, problem description, working time, and solution
- **Auto-incrementing IDs** — ONC-000001, ONC-000002, etc.
- **Assisted-by tracking** — multi-select user picker to record persons called for assistance on each call
- **Solution tracking** — add or edit solutions after submission via a dedicated rich-text editor modal
- **90-day activity heatmap** — visual heatmap in three 30-day blocks showing call volume over time
- **Calendar & filtering** — calendar sidebar for date filtering, full-text search, and sortable table columns
- **Working time tracking** — parse and display durations in `1h30m` format with per-view totals
- **Access control** — admin-configurable list of allowed users
- **Weekly email digest** — per-registrar weekly report with calls overview, time breakdown (Mon–Fri / Saturday / Sunday), and assistance tally

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
- **Auto-incrementing IDs** — CHG-000001, CHG-000002, etc. (6-digit zero-padded)
- **Categories** — Disk, Network, Security, Software, Hardware, Configuration, Other
- **Risk levels** — Low, Medium, High, Critical
- **Linked documentation** — optionally link a changelog entry to a document in any space
- **Syslog forwarding** — change events forwarded to syslog (if enabled) with `[CHANGE]` marker
- **Filtering** — search and filter by date range, category, system name, and free text
- **Configurable retention** — entries older than the configured period are automatically pruned; default 5 years, adjustable in Admin → Settings

### PKI / Certificate Manager
- **Certificate store** — manage X.509 certificates in a hierarchical CA-chain tree view
- **Key generation** — generate RSA-2048, RSA-4096, EC P-256, EC P-384, EC P-521, and Ed25519 private keys; keys are stored encrypted
- **XCA-style CSR creation** — tabbed form with four sections:
  - **Source** — optional template (with Apply Subject / Apply Extensions / Apply All buttons), signing mode (CSR only / self-signed / sign with CA), and signature algorithm (SHA-256/384/512)
  - **Subject** — full Distinguished Name grid (Internal Name, CN, Email, O, OU, C, ST, L) + structured Subject Alternative Names editor (DNS, IP, email, URI, otherName)
  - **Extensions** — Basic Constraints (type + path length + critical), Key Identifiers (SKI/AKI), validity period with quick-pick buttons, CDP and OCSP/AIA URLs
  - **Key Usage** — Key Usage (9 flags) and Extended Key Usage (12 flags) with Critical toggle
- **Templates** — save reusable certificate profiles (Subject + Extensions + Key Usage) and apply them to new CSRs
- **Certificate operations** — import PEM/DER/PKCS7/PKCS12, export to PEM/DER/PKCS7/PKCS12/PFX, revoke with reason, renew, delete
- **Automatic key linking** — imported certificates are automatically linked to existing private keys by matching public key fingerprints; PFX export bundles the private key when linked
- **CRL generation** — generate and download Certificate Revocation Lists per CA
- **Import** — drag-and-drop or browse to import certificate files (PEM, DER, PKCS7, PKCS12) and private key PEMs

### CMDB (Configuration Management Database)
- **IT asset registry** — track hardware, software, and infrastructure CIs with auto-incrementing IDs (AST-0001, etc.)
- **Container tree** — organize CIs in nested groups (racks, locations, departments)
- **CI types** — configurable types (Server, Laptop, Switch, Printer, etc.) with per-type custom fields and icons
- **Lifecycle workflows** — configurable state machines (Requested → Approved → Deployed → In Use → Retired → Disposed) with role-gated transitions
- **Tags & labels** — free-form tags on CIs for cross-cutting categorization with tag-based filtering
- **Saved views** — save and recall named filter presets (container, tags, type, status, search)
- **Bulk operations** — multi-select CIs and mass-update status, owner, type, container, tags, or delete
- **CI templates** — pre-filled templates for common CI setups; "New CI" dropdown selects blank or template
- **Relationships** — configurable relationship types (Runs on, Depends on, Connected to, etc.) between CIs with visual relationship diagram
- **Business services** — define services composed of member CIs with criticality and status tracking
- **Impact analysis** — BFS-based upstream/downstream impact graph showing affected CIs and services
- **Maintenance windows** — scheduled maintenance periods per CI or service; active maintenance shown as 🔧 badge in table
- **Software licenses** — license tracking with compliance monitoring (compliant, over-licensed, under-licensed, expired)
- **Locations** — hierarchical location tree (site → building → floor → room → rack → slot)
- **Compliance checklists** — per-CI compliance checks (Patched, Backed up, Documented, Antivirus, Monitored) with scoring and aggregate dashboard
- **Vulnerability tracking** — CVE-linked vulnerabilities with severity, affected CIs, status workflow (open → mitigated → resolved)
- **Change requests** — formal RFC workflow (draft → pending → approved → implemented) with risk level, affected CIs/services, rollback plan
- **Cost / TCO tracking** — purchase cost, monthly cost, depreciation, vendor, contract renewal per CI with aggregate cost summary
- **SLA monitoring** — per-service uptime targets with breach tracking and resolution
- **Data quality scoring** — per-CI completeness score (owner, type, location, IP, OS, dates, tags) with aggregate dashboard widget
- **Duplicate detection** — automatic flagging of CIs with matching hostnames or IP addresses
- **Expiry alerts** — warranty, license, and contract expiry alerts within 90 days, sorted by urgency
- **Network discovery** — TCP port scanning of IP ranges (CIDR or range notation) with device type heuristics, reverse DNS, and one-click import of discovered devices
- **Automatic inventory** — downloadable agent scripts (Linux/macOS/Windows) that collect hostname, OS, IPs, hardware, installed software and POST to the agent-report API; agent coverage and stale inventory tracking in dashboard
- **CSV import/export** — bulk import from CSV, export filtered results with tags
- **Custom field definitions** — define additional fields per install (text, number, date, boolean, select, URL)

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

### Dashboard
- **Link-card dashboard** — Dashy-style home dashboard with collapsible sections grouping link cards
- **Sections** — named sections with optional icon and colour
- **Links** — each card has a title, URL, description, icon (favicon or custom), colour, and open-in-new-tab toggle
- **Group visibility** — restrict individual link cards to specific user groups

### Users & Auth
- **Session-based authentication** with cookie sessions and idle timeout (NIS2)
- **Active Directory / LDAP** — optional AD/LDAP authentication (plain LDAP or LDAPS); shadow user provisioning with automatic space role sync from AD group mappings
- **TOTP multi-factor authentication** — time-based one-time passwords with QR code setup, backup codes, and admin-forced enrollment
- **bcrypt password hashing** — automatic migration from legacy SHA-256 hashes; configurable bcrypt rounds
- **Password policy** — password history enforcement to prevent reuse
- **Account lockout** — brute-force protection with configurable lockout thresholds
- **User self-registration** — new users register and see a pending access screen until an admin assigns them to a space
- **User Groups** — admin-managed groups of users for dashboard link visibility and permission targeting
- **User profiles** — change full name, email, password, avatar, editor preferences (line spacing, font size, TOC, accent colour)
- **API Keys** — personal user keys (`dk_u_`) and admin-managed service keys (`dk_s_`) with per-space permissions, expiry dates, and a one-time secret reveal
- **Admin panel** — manage users, spaces, groups, permissions, SMTP settings, Active Directory, service API keys, backups, and audit logs
- **SMTP email** — configurable email notifications: new user registration (admins), review assignment, mentions, security incidents, helpdesk ticket events
- **Real-time notifications** — topbar bell updates instantly via SSE; no page refresh required
- **Graceful shutdown** — when the service stops, connected browser tabs receive a 60-second countdown warning, work is autosaved, and all sessions are invalidated before exit
- **MCP server** — standalone Model Context Protocol server (`mcp-server.mjs`) for AI assistant integration (Warp, Claude, Cursor) with 20 tools covering documents, enhanced tables, on-call reports, change log, tags, and system info

### NIS2 Audit Logging
- **34 event types** covering authentication, document changes, user management, space operations, API key lifecycle, and settings changes
- **Encrypted audit logs** — AES-256-GCM encryption of log entries at rest
- **Tamper-proof chain** — HMAC integrity chain for log verification
- **JSONL audit log files** — one file per day under `logs/audit-YYYY-MM-DD.jsonl`, retained for a configurable number of days
- **Syslog forwarding** — optional UDP or TCP syslog (RFC 5424) to a remote SIEM or log collector
- **Admin Audit tab** — calendar heatmap showing event volume, event explorer with filtering, and one-click CSV/JSON export
- **Audit settings API** — configure retention period and syslog target without restarting the service

### Crash Logging
- **Server-side crash capture** — `uncaughtException` and `unhandledRejection` handlers log fatal errors automatically
- **Client-side crash capture** — React error boundary (`global-error.tsx`) and global `window.onerror` / `unhandledrejection` listeners report browser errors to the server
- **JSONL crash log files** — one file per day under `logs/crash-YYYY-MM-DD.jsonl`, retained for 90 days (configurable)
- **Email notifications** — admin receives an email for every crash (if SMTP is configured)
- **Admin Crash Logs tab** — filterable, paginated crash log explorer with expandable stack traces; filter by date, source (server/client), level (error/fatal), and free text
- **Rate-limited client reporting** — unauthenticated `POST /api/crash-logs/report` endpoint with IP-based rate limiting (20/min)

### Backup & Recovery
- **Encrypted backups** — AES-256-GCM encrypted `.tar.gz.enc` archives of all data directories (config, docs, logs, archive, history)
- **Data snapshots** — lightweight local snapshots for fast rollback; created automatically before every `--upgrade`; uses hard links on Linux for near-zero disk overhead; create, restore, and delete via Admin → Backup
- **Backup targets** — local path (covers pre-mounted NFS shares), CIFS/SMB via `smbclient`, and SFTP via `ssh2` (password or private key)
- **Scheduling** — manual or automated backups with configurable time and day-of-week
- **Retention policy** — configurable retention count; old backups pruned automatically
- **Restore** — decrypt and restore from any backup archive via the admin panel
- **Encryption key rotation** — rotate the field-encryption key with automatic re-encryption of all TOTP secrets, CIFS/SFTP credentials, and backup archives

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
- **Storage**: Markdown documents on disk; configuration in SQLite (`config/docit.db`); attachments in `config/blobstore/` (SHA-256 content-addressed)
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
| `--branch` / `-Branch` | Git branch to install (default: `main`, use `dev` for development) |

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

The upgrade path automatically creates a **data snapshot** before pulling code, stops the running service, fetches and hard-resets to the latest commit, fixes file ownership, rebuilds as the service user, and restarts. If something goes wrong, restore from the snapshot via **Admin → Backup → Data Snapshots**.

### Development Branch

Doc-it maintains two branches:
- **`main`** — stable production releases
- **`dev`** — development builds with latest features (may be unstable)

To install or upgrade from the development branch:

```bash
# macOS
bash install-mac.sh --branch dev
bash install-mac.sh --upgrade --branch dev

# Linux
bash install-linux.sh --branch dev
bash install-linux.sh --upgrade --branch dev

# Windows
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Branch dev
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Upgrade -Branch dev
```

Omitting `--branch` defaults to `main`.

### Manual Install

If you prefer to install without the installer scripts, follow the steps below.

#### Prerequisites

| Component | Version | Purpose |
|---|---|---|
| **Node.js** | 24 LTS or newer | JavaScript runtime |
| **npm** | 10+ (ships with Node.js 24) | Package manager |
| **git** | any recent version | Clone the repository |
| **Python 3** | 3.8+ (optional) | Required by `better-sqlite3` build step on some systems |
| **C/C++ build tools** | see below | Required to compile native modules (`better-sqlite3`, `ssh2`) |

> **Why native build tools?** Doc-it uses `better-sqlite3` (SQLite) and `ssh2` (SFTP backups) which include C/C++ addons compiled during `npm install`.

#### macOS

```bash
# 1. Install Xcode Command Line Tools (provides clang/make)
xcode-select --install

# 2. Install Node.js 24 via Homebrew (or nvm)
brew install node@24
# — or with nvm —
nvm install 24
nvm use 24

# 3. Verify
node -v   # v24.x.x
npm -v    # 10.x.x

# 4. Clone and install
git clone https://github.com/talder/doc-it.git
cd doc-it
npm install

# 5. Run
npm run dev              # development (http://localhost:3000)
# — or —
npm run build && npm start  # production
```

#### Ubuntu / Debian Linux

```bash
# 1. Install build essentials (gcc, g++, make) and Python
sudo apt update
sudo apt install -y build-essential python3 git curl

# 2. Install Node.js 24 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
# — or with nvm —
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24

# 3. Verify
node -v   # v24.x.x
npm -v    # 10.x.x

# 4. Clone and install
git clone https://github.com/talder/doc-it.git
cd doc-it
npm install

# 5. Run
npm run dev              # development (http://localhost:3000)
# — or —
npm run build && npm start  # production
```

#### RHEL / CentOS / Fedora

```bash
# 1. Install build tools
sudo dnf groupinstall -y "Development Tools"
sudo dnf install -y python3 git

# 2. Install Node.js 24
curl -fsSL https://rpm.nodesource.com/setup_24.x | sudo bash -
sudo dnf install -y nodejs

# 3. Clone and install
git clone https://github.com/talder/doc-it.git
cd doc-it
npm install
npm run build && npm start
```

#### Windows

```powershell
# 1. Install Node.js 24 from https://nodejs.org (LTS)
#    During install, check "Automatically install the necessary tools"
#    (this installs Visual Studio Build Tools + Python via Chocolatey)
#
# — or via winget —
winget install OpenJS.NodeJS.LTS

# 2. If you skipped the build tools checkbox, install them manually:
npm install -g windows-build-tools
# — or install Visual Studio Build Tools from https://visualstudio.microsoft.com/downloads/
# Select "Desktop development with C++" workload

# 3. Verify
node -v   # v24.x.x
npm -v    # 10.x.x

# 4. Clone and install
git clone https://github.com/talder/doc-it.git
cd doc-it
npm install

# 5. Run
npm run dev              # development (http://localhost:3000)
# — or —
npm run build; npm start  # production
```

#### Docker (alternative)

```dockerfile
FROM node:24-alpine
RUN apk add --no-cache python3 make g++ git
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t doc-it .
docker run -p 3000:3000 -v doc-it-data:/app/config -v doc-it-docs:/app/docs doc-it
```

#### First Launch

On first launch, open [http://localhost:3000/setup](http://localhost:3000/setup) to create the initial admin account.

#### Troubleshooting

| Problem | Solution |
|---|---|
| `npm install` fails with `node-gyp` errors | Install C/C++ build tools (see platform instructions above) |
| `better-sqlite3` build fails | Ensure Python 3 is installed and in PATH |
| `ERR_MODULE_NOT_FOUND` on startup | Run `npm install` again — a dependency may have failed silently |
| Port 3000 already in use | Set `PORT=3001 npm start` or stop the other process |
| `EACCES` permission errors on Linux | Don't run with `sudo` — fix directory ownership instead: `sudo chown -R $USER:$USER .` |
| Canvas / Excalidraw errors during build | These are expected in SSR and are handled — the app works correctly |

## Project Structure

```
config/              # SQLite database, avatars, blobstore
  docit.db           # SQLite KV + blob/attachment_refs tables (WAL mode)
  avatars/           # User avatar images
  blobstore/         # Content-addressed attachments ({sha256} files)
docs/                # Document storage (docs/{space}/{category}/{doc}.md)
archive/             # Archived documents
history/             # Revision snapshots
backups/             # Encrypted backup archives (.tar.gz.enc)
snapshots/           # Pre-upgrade data snapshots for fast rollback
logs/                # Audit logs (audit-YYYY-MM-DD.jsonl) & crash logs (crash-YYYY-MM-DD.jsonl)
src/
  app/
    api/             # API routes (auth, spaces, docs, settings, assets,
                     #   helpdesk, portal, journal, changelog, audit, backup)
    admin/           # Admin panel
    cmdb/            # CMDB page
    assets/          # Redirect to /cmdb
    changelog/       # Change log page
    helpdesk/        # Helpdesk agent UI + admin config
    journal/         # Personal & space journal
    oncall/          # On-call reports
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
    enhanced-table/  # Enhanced table views (table, kanban, gallery, calendar)
    helpdesk/        # Helpdesk components (WidgetRenderer, PortalPageDesigner)
    modals/          # Modal dialogs
    sidebar/         # Sidebar with categories, docs, tags
    Editor.tsx       # Main editor component
    Topbar.tsx       # Top navigation bar
    SearchModal.tsx  # Global search (Cmd+K)
  lib/
    auth.ts          # Authentication (bcrypt, sessions, TOTP)
    config.ts        # SQLite-backed config read/write, blob table init
    blobstore.ts     # Global content-addressed blobstore (dedup, PDF text, migration)
    shutdown.ts      # SIGTERM pub/sub for graceful-shutdown signalling
    notification-bus.ts # In-memory pub/sub for real-time notification push
    notifications.ts # In-app + email notifications with SSE push
    helpdesk.ts      # Helpdesk module (tickets, groups, SLA, rules, forms, portal pages)
    helpdesk-portal.ts # Portal user auth (separate from main auth)
    cmdb.ts          # CMDB module (CI registry, compliance, vulnerabilities, change requests, SLA, cost)
    cmdb-shared.ts   # Client-safe CMDB helpers (lifecycle state, location path)
    cmdb-scanner.ts  # Network discovery scanner (TCP port probe, DNS lookup)
    changelog.ts     # Change log module
    enhanced-table.ts # Enhanced table CRUD (JSON files per space)
    oncall.ts        # On-call reports module (server-side CRUD, filtering, email)
    oncall-shared.ts # Client-safe on-call types and pure helpers
    journal.ts       # Journal module (encrypted user journals)
    audit.ts         # NIS2 audit logging (encrypted, syslog, write queue)
    crash-log.ts     # Crash logging (server + client, JSONL, email alerts)
    backup.ts        # Backup & restore (AES-256-GCM encrypted archives)
    crypto.ts        # Field encryption & key management
    key-rotation.ts  # Encryption key rotation
    permissions.ts   # Space role-based access control
    email.ts         # Nodemailer SMTP utilities
    ad.ts            # Active Directory / LDAP authentication
    dashboard.ts     # Link-card dashboard (sections and links)
    user-groups.ts   # Admin-managed user groups
    space-cache.ts   # 60-second in-process space data cache
    types.ts         # TypeScript type definitions
```

## Configuration

All runtime configuration is stored in a SQLite database at `config/docit.db` using a key-value table. On first startup, any existing JSON files in the `config/` directory are automatically migrated into the database.

Key configuration entries (stored as JSON values):

- `users.json` — user accounts (bcrypt hashes, TOTP secrets)
- `sessions.json` — active sessions
- `spaces.json` — spaces and permissions
- `smtp.json` — SMTP email settings (configurable in Admin → Settings)
- `helpdesk.json` — helpdesk configuration (groups, categories, fields, forms, rules, SLA, portal pages)
- `helpdesk-tickets.json` — ticket storage
- `assets.json` — CMDB data (CIs, types, relationships, services, compliance, vulnerabilities, change requests, SLA, templates, scan configs)
- `changelog.json` — change log entries
- `changelog-settings.json` — changelog retention period (default 5 years)
- `oncall.json` — on-call report entries
- `oncall-settings.json` — on-call allowed users, email settings
- `audit.json` — audit configuration
- `backup.json` — backup configuration and targets
- `ad.json` — Active Directory / LDAP authentication settings
- `dashboard.json` — dashboard sections and links
- `user-groups.json` — user groups

Avatars are stored in `config/avatars/`.

### Storage Location (`docit.config.json`)

By default all data directories (`docs/`, `archive/`, `history/`, `logs/`, `trash/`) are created inside the application directory. To move them to a different volume or mount point, create `docit.config.json` in the application root:

```json
{
  "storageRoot": "/mnt/nas/doc-it-data"
}
```

The path must be absolute. The change takes effect immediately — no restart required. **Move any existing data manually before saving the new path.**

If the file is absent or `storageRoot` is omitted, doc-it falls back to the application directory (fully backward-compatible).

The storage path can also be configured in **Admin → Settings → Storage Location**.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `SECRET_FIELD_KEY` | (auto-generated) | AES-256-GCM key for field-level encryption. Auto-generated on first boot and stored in `config/docit.db`. |
| `SECURE_COOKIES` | `true` in production | Set to `false` to disable the `Secure` flag on session cookies. Useful for HTTP-only lab/reverse-proxy deployments. |

## License

Licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

Free to use, modify, and self-host for **non-commercial** purposes. Commercial use requires a separate license — contact the project maintainer.
