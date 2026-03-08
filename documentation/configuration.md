# Configuration

## Themes

doc-it ships with **17 built-in themes**. Each user can choose their own theme from the Profile page (`/profile`).

Themes affect the colour palette (background, surface, text, accent) across the entire interface. The selected theme is stored in the user's preferences and persists across devices.

Available themes include: `default`, `dark`, `light`, `ocean`, `forest`, `sunset`, `midnight`, `rose`, `slate`, and more.

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

Configuration is stored in `data/settings/smtp.json`.

---

## Audit Logging

Audit logging is **always on** by default and writes to `logs/audit-YYYY-MM-DD.jsonl`.

See [Admin → Audit](admin/audit.md) for full configuration options including:

- Retention period (days)
- Optional syslog forwarding (UDP or TCP, RFC 5424)

Configuration is stored in `data/settings/audit.json`.

---

## Environment Variables

doc-it uses Next.js conventions. You can create a `.env.local` file in the project root for any custom overrides:

```bash
# Optional: override the data directory path
# DATA_DIR=/mnt/storage/doc-it-data
```

No environment variables are required for basic operation.

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
