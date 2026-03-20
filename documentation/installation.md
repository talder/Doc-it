# Installation

## Requirements

| Requirement | Version |
|---|---|
| Node.js | 24 or later |
| npm | 10 or later |
| Operating System | macOS 12+, Ubuntu/Debian Linux, Windows 10/11 |

No external database server is required — doc-it uses an embedded **SQLite** key-value store (`config/docit.db`) for configuration and Markdown files on disk for documents.

---

## Quick Install (Recommended)

Installer scripts handle all prerequisites automatically: they install Homebrew (macOS), configure NodeSource (Linux), or use winget (Windows), then install git, Node.js 24, clone the repo, and run `npm install` + `npm run build`.

### macOS (Apple Silicon & Intel)

```bash
bash install-mac.sh
```

Installs prerequisites via **Homebrew**. Prompts for sudo when writing to `/opt/doc-it` and `/Library/LaunchDaemons`.

### Ubuntu / Debian Linux

```bash
bash install-linux.sh
```

Installs Node.js 24 via the **NodeSource** apt repository. Run as root or with a sudo-capable user.

### Windows (PowerShell — run as Administrator)

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1
```

Installs prerequisites via **winget**. Falls back to a direct Node.js MSI download from nodejs.org if winget is unavailable (older Windows 10 builds). Requires an elevated PowerShell session.

---

## Installer Options

All three scripts support the same set of options:

| Flag (bash) | Flag (PowerShell) | Description |
|---|---|---|
| `--upgrade` | `-Upgrade` | Pull latest from GitHub, reinstall deps, rebuild, restart service |
| `--force` | `-Force` | Override an existing Node.js version conflict |
| `--no-ssl` | `-NoSsl` | Disable SSL verification (corporate proxy / self-signed cert) |
| `--service` | `-Service` | Install as a system service (auto-start at boot) |
| `--check` | `-Check` | Run preflight checks only — exit 0 if all pass, 1 if any fail |
| `--dir <path>` | `-Dir <path>` | Override install directory |
| `--help` | `-Help` | Show usage |

Default install directories:
- macOS / Linux: `/opt/doc-it`
- Windows: `C:\doc-it`

---

## Preflight Checks

Every script runs a preflight check phase before installing. Checks include:

- OS version and architecture
- Privilege level (sudo / Administrator)
- git availability
- Node.js version vs. the `>=24` requirement — shows the `--force` hint if a conflicting version is found
- `github.com` reachability (with SSL-bypass retry and `-NoSsl` hint)
- GitHub repo reachability via `git ls-remote`
- npm registry reachability
- Available disk space (500 MB minimum)
- Install directory status

Run checks without installing:

```bash
bash install-mac.sh --check
bash install-linux.sh --check
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Check
```

Exits `0` if all checks pass, `1` if any fail — suitable for CI or pre-deployment validation.

---

## Node.js Version Conflict

If another Node.js version is already installed, the script will block with a clear message and show the `--force` flag:

```bash
bash install-mac.sh --force
bash install-linux.sh --force
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Force
```

`--force` only bypasses the Node.js conflict check — it does not skip any other preflight validation.

---

## Corporate Proxy / SSL Issues

If your network intercepts HTTPS (e.g. a corporate proxy with a self-signed certificate), use `--no-ssl` / `-NoSsl`:

```bash
bash install-mac.sh --no-ssl
bash install-linux.sh --no-ssl
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -NoSsl
```

This passes `-k` to curl, sets `GIT_SSL_NO_VERIFY=true`, and adds `--strict-ssl=false` to npm.

---

## Service Installation

Add `--service` / `-Service` to register doc-it as a system service that starts automatically at boot:

```bash
bash install-mac.sh --service
bash install-linux.sh --service
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Service
```

### macOS — launchd

- Plist: `/Library/LaunchDaemons/com.talder.docit.plist`
- Logs: `/var/log/doc-it/`
- Manage:
  ```bash
  sudo launchctl load   /Library/LaunchDaemons/com.talder.docit.plist
  sudo launchctl unload /Library/LaunchDaemons/com.talder.docit.plist
  ```

### Linux — systemd

- Unit file: `/etc/systemd/system/doc-it.service`
- Runs as: `doc-it` system user (no login shell)
- Logs: `/var/log/doc-it/` + `journalctl -u doc-it`
- Manage:
  ```bash
  sudo systemctl start   doc-it
  sudo systemctl stop    doc-it
  sudo systemctl status  doc-it
  sudo journalctl -u doc-it -f
  ```

### Windows — Windows Service (NSSM)

- Installed via [NSSM](https://nssm.cc) (`winget install NSSM.NSSM`)
- Start type: **delayed auto-start** (avoids network/disk race at boot)
- Logs: `<install-dir>\logs\service.log` (rotated at 10 MB)
- Failure recovery: restart at 5 s / 10 s / 30 s
- Manage:
  ```powershell
  Start-Service doc-it
  Stop-Service  doc-it
  Get-Service   doc-it
  ```

---

## Upgrading

```bash
# macOS
bash install-mac.sh --upgrade

# Linux
bash install-linux.sh --upgrade

# Windows (PowerShell as Administrator)
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Upgrade
```

The upgrade path:
1. Stops the running service (if installed)
2. Runs `git fetch origin main && git reset --hard origin/main` — local changes are discarded; never modify files in the install directory manually
3. Runs `npm install` as the `doc-it` service user
4. Runs `npm run build` as the `doc-it` service user
5. Runs `chown -R doc-it:doc-it` to fix any root-owned files from a previous build
6. Restarts the service

> **Important:** Any local changes to files in the install directory are discarded on upgrade. User data (`config/`, `docs/`, `history/`, `logs/`) is never touched by the upgrade process.

No database migrations are required. Back up `config/`, `docs/`, `logs/`, and `history/` before upgrading if you want a rollback point.

---

## Manual Installation

If you prefer not to use the installer scripts:

```bash
git clone https://github.com/talder/doc-it.git
cd doc-it
npm install
npm run build
npm start
```

---

## First-run Setup Wizard

On the very first visit, doc-it detects that no admin account exists and redirects to `/setup`.

1. Enter a **username** and **password** for the super-admin account.
2. Submit the form.
3. You are automatically logged in and taken to the main workspace.

The super-admin can never be deleted and always retains full access to all features.

---

## File Permissions & Service User

When installed as a system service (`--service`), doc-it runs under a **dedicated service user** that needs read/write access to the install directory and all runtime data directories.

### How it works per platform

**Linux** — The installer creates a `doc-it` system user and group. All files under the install directory (default `/opt/doc-it`) are owned by `doc-it:doc-it`. The systemd unit runs the process as this user.

**macOS** — The launchd service runs as the user who ran the installer (typically your normal macOS user account). The install directory is owned by that user.

**Windows** — The NSSM service runs as `SYSTEM`, which has full access. No special permission setup is needed.

### Writable directories

The following directories must be writable by the service user. The installer pre-creates them automatically, but if you set up manually or move the install directory you must ensure correct ownership:

```
<install-dir>/
├── config/       # SQLite database (docit.db), avatars
├── docs/         # Markdown documents, databases, attachments
├── logs/         # Audit logs, crash logs
├── archive/      # Archived documents
├── history/      # Document revision history
├── backups/      # Encrypted backup archives
├── trash/        # Soft-deleted documents
└── .next/        # Next.js build cache (written during build + runtime)
```

### Troubleshooting permission errors

If doc-it starts but returns errors when logging in, creating documents, or saving settings, the service user likely cannot write to the data directories.

**Linux — fix ownership:**
```bash
sudo chown -R doc-it:doc-it /opt/doc-it
```

**macOS — fix ownership** (replace `youruser` with the user that runs the service):
```bash
sudo chown -R youruser /opt/doc-it
```

**Verify the service user:**
```bash
# Linux — check which user the service runs as
ps -eo user,comm | grep node

# Linux — check directory ownership
ls -la /opt/doc-it/
```

After fixing permissions, restart the service:
```bash
# Linux
sudo systemctl restart doc-it

# macOS
sudo launchctl stop com.talder.docit && sudo launchctl start com.talder.docit
```

### Manual installation note

If you install manually (without `--service`), doc-it runs as the current user and writes to the current working directory. Ensure the user running `npm start` has write access to the project directory.

---

## Data Storage

All data is stored on disk in several top-level directories (created automatically on first run):

```
config/
├── docit.db              # SQLite KV store (WAL mode) — users, spaces,
│                         #   settings, service keys, helpdesk, assets,
│                         #   blob registry, attachment references
├── avatars/              # User avatar images
└── blobstore/            # Content-addressed attachments ({sha256} files)
docs/
└── <space-slug>/
    ├── <category>/
    │   ├── document.md   # Markdown documents
    │   ├── template.mdt  # Template documents
    │   └── attachments/  # Legacy attachment location (migrated to blobstore)
    ├── .databases/
    │   └── <id>.db.json  # Database schema + rows (one file per database)
    ├── .doc-status.json  # Document workflow statuses
    └── .customization.json
archive/
└── <space-slug>/         # Archived (soft-deleted) documents
history/
└── <space-slug>/
    └── <category>/
        └── <docname>/    # Revision snapshots (1.md, 1.json, 2.md, ...)
logs/
└── audit-YYYY-MM-DD.jsonl  # Audit log files (one per day)
backups/
└── docit-backup-*.tar.gz.enc  # Encrypted backup archives
```

Back up the `config/`, `docs/`, `history/`, and `logs/` directories to protect your content. Alternatively, use the built-in [Backup](features/backup.md) feature for automated encrypted backups.
