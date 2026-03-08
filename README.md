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

This project was heavily inspired by **[Jotty](https://github.com/fccview/jotty)** by [@fccview](https://github.com/fccview) — a fantastic lightweight self-hosted note-taking app with a clean interface and file-based storage philosophy.

A huge shoutout and thank you to the Jotty developer for the great open-source work! Go check out and star the project:

> ⭐ **[github.com/fccview/jotty](https://github.com/fccview/jotty)**

---

## Features

### Spaces & Organization
- **Spaces** — isolated documentation workspaces with role-based access (admin / writer / reader)
- **Categories** — nested folder structure within each space
- **Tags** — hierarchical `#tag` system with `#parent/child` support, inline tag linking, and tag-based filtering

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

### Users & Auth
- **Session-based authentication** with cookie sessions
- **User self-registration** — new users register and see a pending access screen until an admin assigns them to a space
- **User profiles** — change full name, email, password, avatar, editor preferences (line spacing, font size, TOC, accent colour)
- **API Keys** — personal user keys (`dk_u_`) and admin-managed service keys (`dk_s_`) with per-space permissions, expiry dates, and a one-time secret reveal
- **Admin panel** — manage users, spaces, permissions, SMTP settings, service API keys, and audit logs
- **SMTP email** — configurable email notifications (e.g. admin notified on new registration)

### NIS2 Audit Logging
- **34 event types** covering authentication, document changes, user management, space operations, API key lifecycle, and settings changes
- **JSONL audit log files** — one file per day under `logs/audit-YYYY-MM-DD.jsonl`, retained for a configurable number of days
- **Syslog forwarding** — optional UDP or TCP syslog (RFC 5424) to a remote SIEM or log collector
- **Admin Audit tab** — calendar heatmap showing event volume, event explorer with filtering, and one-click CSV/JSON export
- **Audit settings API** — configure retention period and syslog target without restarting the service

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
- **Storage**: File-based (JSON config + Markdown documents on disk)

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
config/              # JSON config files (users, sessions, spaces, smtp, avatars)
docs/                # Document storage (docs/{space}/{category}/{doc}.md)
archive/             # Archived documents
history/             # Revision snapshots
src/
  app/
    api/             # API routes (auth, spaces, docs, settings, assets)
    admin/           # Admin panel
    login/           # Login page
    register/        # Registration page
    profile/         # User profile page
    setup/           # First-time setup
    page.tsx         # Main app (editor + sidebar)
  components/
    extensions/      # TipTap extensions (slash commands, callouts, excalidraw,
                     #   draw.io, collapsible lists, drag handle, tags, etc.)
    modals/          # Modal dialogs
    sidebar/         # Sidebar with categories, docs, tags
    Editor.tsx       # Main editor component
    Topbar.tsx       # Top navigation bar
  lib/
    auth.ts          # Authentication utilities
    config.ts        # File-based config read/write
    email.ts         # Nodemailer SMTP utilities
    types.ts         # TypeScript type definitions
```

## Configuration

All configuration is stored as JSON files in the `config/` directory:

- `users.json` — user accounts
- `sessions.json` — active sessions
- `spaces.json` — spaces and permissions
- `smtp.json` — SMTP email settings (configurable in Admin → Settings)

Avatars are stored in `config/avatars/`.

## License

Licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

Free to use, modify, and self-host for **non-commercial** purposes. Commercial use requires a separate license — contact the project maintainer.
