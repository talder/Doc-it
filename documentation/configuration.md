# Configuration

## Themes

doc-it ships with **17 built-in themes**. Each user can choose their own theme from the Profile page (`/profile`).

Themes affect the colour palette (background, surface, text, accent) across the entire interface. The selected theme is stored in the user's preferences and persists across devices.

Available themes:

**Light:** `light`, `solarized-light`, `dracula-light`, `catppuccin-latte`, `blossom`, `lavender`, `paper`, `high-contrast`

**Dark:** `dark`, `dracula`, `nord`, `solarized-dark`, `github-dark`, `catppuccin`, `twilight`, `midnight-rose`, `high-contrast-dark`

---

## User Preferences

Each user can configure the following on their **Profile** page:

| Preference | Options |
|---|---|
| Theme | 17 built-in themes |
| Accent colour | Custom hex colour |
| Font size | Small / Medium / Large |
| Editor line spacing | Compact / Relaxed |
| Page width | Narrow / Wide / Max |
| Always show TOC | On / Off |

---

## SMTP (Email)

Email is used for notifications. Configure it in **Admin → Settings**.

Fields:

| Field | Description |
|---|---|
| Host | SMTP server hostname |
| Port | Default `587` |
| Secure | TLS (`true`) or STARTTLS (`false`) |
| Username | SMTP auth username |
| Password | SMTP auth password |
| From address | Sender address shown to recipients |
| Admin email | Destination for system alerts |

Configuration is stored in the SQLite KV store (`config/docit.db`) under the key `smtp.json`.

---

## Audit Logging

Audit logging is **always on** by default and writes to `logs/audit-YYYY-MM-DD.jsonl`.

See [Admin → Audit](admin/audit.md) for full configuration options including:

- Retention period (days)
- Optional syslog forwarding (UDP or TCP, RFC 5424)

Configuration is stored in the SQLite KV store (`config/docit.db`) under the key `audit.json`.

---

## Storage Location

By default, all data directories (`docs/`, `archive/`, `history/`, `logs/`, `trash/`) live inside the application directory. To redirect them to a separate volume or NAS mount, create `docit.config.json` in the application root:

```json
{
  "storageRoot": "/mnt/nas/doc-it-data"
}
```

Rules:
- The path must be **absolute**.
- The file is optional — if absent or if `storageRoot` is omitted, the application directory is used (fully backward-compatible).
- The change is **hot**: it takes effect on the next incoming request without a server restart.
- doc-it does **not** move existing files automatically. Migrate data directories manually before changing the path.

You can also set or inspect the storage root via **Admin → Settings → Storage Location** or the API (`GET/PUT /api/settings/storage`).

---

## Environment Variables

No environment variables are required for basic operation.

| Variable | Default | Description |
|---|---|---|
| `SECRET_FIELD_KEY` | (auto-generated) | AES-256-GCM encryption key for field-level data (TOTP secrets, journal entries, backup archives, CIFS/SFTP credentials). Auto-generated on first boot and stored in `config/docit.db`. Override to pin a static key (useful for restoring backups across instances). |
| `SECURE_COOKIES` | `true` in production | Set to `false` to disable the `Secure` flag on HTTP-only session cookies. Useful when running behind a reverse proxy that terminates TLS but forwards HTTP internally, or in local lab environments. |

doc-it uses `docit.config.json` (above) for storage path configuration rather than environment variables.

---

## Reverse Proxy (Production)

When running behind nginx or a similar reverse proxy, ensure:

1. WebSocket connections are proxied (used by the real-time presence system via SSE).
2. The `X-Forwarded-For` header is forwarded so that IP addresses are correctly logged in audit events.

Example nginx config snippet:

```nginx
location / {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cache_bypass $http_upgrade;
}
```
