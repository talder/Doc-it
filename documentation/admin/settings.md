# Admin — Settings

The **Settings** tab (`/admin?tab=settings`) contains system-wide configuration, currently SMTP email settings.


---

## SMTP Configuration

Configure outbound email for notifications.

| Field | Description | Example |
|---|---|---|
| Host | SMTP server address | `smtp.gmail.com` |
| Port | SMTP port | `587` (STARTTLS) or `465` (TLS) |
| Secure | Use TLS directly (true for port 465) | `false` |
| Username | SMTP authentication username | `noreply@example.com` |
| Password | SMTP authentication password | (write-only) |
| From address | Sender shown to email recipients | `doc-it <noreply@example.com>` |
| Admin email | Destination for system alerts | `admin@example.com` |

Click **Save** to apply. Changes take effect immediately.

### Common Providers

**Gmail**
```
Host: smtp.gmail.com  Port: 587  Secure: false
User: you@gmail.com   Pass: (App Password)
```

**SendGrid**
```
Host: smtp.sendgrid.net  Port: 587  Secure: false
User: apikey            Pass: (SendGrid API Key)
```

**AWS SES**
```
Host: email-smtp.us-east-1.amazonaws.com  Port: 587  Secure: false
User: (SMTP Access Key ID)   Pass: (SMTP Secret)
```

---

## Change Log

Configure how long change log entries are retained.

| Field | Description | Default |
|---|---|---|
| Retention (years) | Entries older than this are pruned automatically on each write | `5` |

Click **Save** to apply. Pruning runs on the next new entry; existing old entries are not removed until a new entry is added.

---

## Storage Location

Sets the root directory where all data directories (`docs/`, `archive/`, `history/`, `logs/`, `trash/`) are stored.

| Field | Description |
|---|---|
| Storage Root | Absolute path on the server filesystem (e.g. `/mnt/nas/doc-it-data`) |

Leave blank to use the application directory (default, backward-compatible).

> **Warning:** doc-it does **not** migrate existing files when you change this path. Move all data directories manually to the new location before saving, otherwise documents and history will appear missing.

The effective path and all resolved sub-paths are shown in a read-only preview below the input field.

---

## Audit Settings

See [Admin — Audit](audit.md) for the audit logging configuration which lives in the Audit tab.
