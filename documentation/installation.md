# Installation & Upgrade Guide

---

## Quick Install

Installer scripts handle all prerequisites (Homebrew / apt / winget, git, Node.js 24) and clone the repository automatically.

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

---

## Installer Options

All platforms support the same flags (bash uses `--flag`, PowerShell uses `-Flag`):

| Flag | Description |
|---|---|
| `--upgrade` / `-Upgrade` | Pull latest code, reinstall dependencies, rebuild |
| `--force` / `-Force` | Override an existing Node.js version conflict |
| `--no-ssl` / `-NoSsl` | Disable SSL verification (corporate proxies) |
| `--service` / `-Service` | Install as a system service (auto-start at boot) |
| `--check` / `-Check` | Run preflight checks only — do not install |
| `--dir <path>` / `-Dir <path>` | Override install directory |
| `--branch <name>` / `-Branch <name>` | Git branch to install (default: `main`) |
| `--help` / `-Help` | Show help |

**Default directories:**
- macOS: `/opt/doc-it`
- Linux: `/opt/doc-it`
- Windows: `C:\doc-it`

---

## Preflight Checks

Before installing, the script runs automated checks and reports status for each:

- Operating system and architecture
- sudo / Administrator access
- git availability
- Node.js version (>= 24 required)
- Network connectivity (github.com, npm registry)
- Disk space (500 MB minimum)
- Install directory status

Run checks without installing:

```bash
bash install-mac.sh --check
bash install-linux.sh --check
```

---

## What the Installer Does

### Fresh Install

1. **Installs prerequisites** — Homebrew (macOS), build tools (Linux), git, Node.js 24
2. **Clones the repository** — `git clone` from GitHub into the install directory
3. **Installs npm dependencies** — `npm install`
4. **Patches vulnerabilities** — `npm audit fix` (safe, semver-range only)
5. **Builds for production** — `npm run build`
6. **Configures service** (if `--service`) — launchd (macOS), systemd (Linux), NSSM Windows Service

### Upgrade (`--upgrade`)

1. **Stops the running service** (if installed as a service)
2. **Creates a data snapshot** — copies `config/`, `docs/`, `logs/`, `archive/`, `history/` to `snapshots/{timestamp}_pre-upgrade`
3. **Pulls latest code** — `git fetch` + `git reset --hard` to the target branch
4. **Fixes file ownership** (Linux) — ensures the service user owns all files
5. **Installs dependencies** — `npm install`
6. **Patches vulnerabilities** — `npm audit fix`
7. **Rebuilds** — `npm run build`
8. **Restarts the service**

Only the 5 most recent snapshots are kept; older ones are pruned automatically.

If something goes wrong after an upgrade, restore from the snapshot via **Admin → Backup → Data Snapshots**.

---

## Service Installation

### macOS (launchd)

```bash
bash install-mac.sh --service
```

- Creates `/Library/LaunchDaemons/com.talder.docit.plist`
- Runs as the current user
- Auto-starts at boot
- Logs: `/var/log/doc-it/`
- Commands:
  ```bash
  sudo launchctl start com.talder.docit
  sudo launchctl stop  com.talder.docit
  sudo launchctl list | grep docit
  ```

### Linux (systemd)

```bash
bash install-linux.sh --service
```

- Creates `/etc/systemd/system/doc-it.service`
- Creates a dedicated `doc-it` system user
- Auto-starts at boot
- Logs: `journalctl -u doc-it`
- Commands:
  ```bash
  sudo systemctl start   doc-it
  sudo systemctl stop    doc-it
  sudo systemctl restart doc-it
  sudo systemctl status  doc-it
  ```

### Windows (NSSM)

```powershell
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Service
```

- Installs NSSM (Non-Sucking Service Manager) via winget
- Creates a Windows Service with **delayed auto-start**
- Automatic restart on failure (5s / 10s / 30s intervals)
- Logs: `<install-dir>\logs\service.log` (auto-rotated at 10 MB)
- Commands:
  ```powershell
  Start-Service doc-it
  Stop-Service  doc-it
  Get-Service   doc-it
  ```

---

## Branches

Doc-it maintains two branches:

| Branch | Purpose | Stability |
|---|---|---|
| `main` | Production releases | Stable |
| `dev` | Development builds | May be unstable |

### Installing from the dev branch

```bash
# macOS
bash install-mac.sh --branch dev

# Linux
bash install-linux.sh --branch dev

# Windows
powershell -ExecutionPolicy Bypass -File install-windows.ps1 -Branch dev
```

### Upgrading a dev installation

```bash
bash install-mac.sh --upgrade --branch dev
bash install-linux.sh --upgrade --branch dev
```

Omitting `--branch` always defaults to `main`.

---

## Manual Install (Without Installer Scripts)

### Prerequisites

| Component | Version | Purpose |
|---|---|---|
| **Node.js** | 24 LTS or newer | JavaScript runtime |
| **npm** | 10+ (ships with Node.js 24) | Package manager |
| **git** | any recent version | Clone the repository |
| **Python 3** | 3.8+ (optional) | Required by `better-sqlite3` build step on some systems |
| **C/C++ build tools** | see below | Required to compile native modules |

### Steps

```bash
# 1. Clone
git clone https://github.com/talder/doc-it.git
cd doc-it

# 2. Install dependencies
npm install

# 3. Patch vulnerabilities
npm audit fix

# 4. Build
npm run build

# 5. Start
npm start              # production (http://localhost:3000)
# — or —
npm run dev            # development with hot reload
```

### Platform-specific build tools

**macOS:**
```bash
xcode-select --install    # provides clang/make
brew install node@24
```

**Ubuntu/Debian:**
```bash
sudo apt install -y build-essential python3 git curl
```

**Windows:**
- Install Node.js from [nodejs.org](https://nodejs.org) and check "Automatically install necessary tools"
- Or: `npm install -g windows-build-tools`

---

## Docker

```dockerfile
FROM node:24-alpine
RUN apk add --no-cache python3 make g++ git
WORKDIR /app
COPY package*.json ./
RUN npm ci && npm audit fix
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t doc-it .
docker run -p 3000:3000 -v doc-it-data:/app/config -v doc-it-docs:/app/docs doc-it
```

---

## First Launch

1. Open [http://localhost:3000/setup](http://localhost:3000/setup)
2. Create the initial admin account (username, password, email)
3. You will be redirected to the login page
4. Log in and start creating spaces and documents

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `npm install` fails with `node-gyp` errors | Install C/C++ build tools (see platform instructions above) |
| `better-sqlite3` build fails | Ensure Python 3 is installed and in PATH |
| `ERR_MODULE_NOT_FOUND` on startup | Run `npm install` again — a dependency may have failed silently |
| Port 3000 already in use | Set `PORT=3001 npm start` or stop the other process |
| `EACCES` permission errors on Linux | Don't run with `sudo` — fix ownership: `sudo chown -R doc-it:doc-it /opt/doc-it` |
| Canvas / Excalidraw errors during build | Expected in SSR — the app works correctly |
| Service won't stop during upgrade | The installer sends a 60-second shutdown countdown to all connected users, saves their work, and invalidates all sessions before stopping |

---

## Graceful Shutdown During Upgrades

When the service is stopped for an upgrade:

1. All connected browser sessions receive a **60-second countdown warning**
2. Any open documents are **auto-saved** immediately
3. After the countdown, all **sessions are invalidated** (users redirected to login)
4. The service exits cleanly

The installer can also trigger this countdown via the admin API before stopping:

```bash
curl -X POST http://localhost:3000/api/admin/shutdown \
  -H "Authorization: Bearer dk_s_your_service_key"
# Wait 70 seconds, then stop the service
```
