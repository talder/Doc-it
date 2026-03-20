# Admin — Settings

The **Settings** tab (`/admin?tab=settings`) contains system-wide configuration: SMTP email, encryption key management, dashboard access, Active Directory, storage location, change log retention, and audit settings.

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

## Encryption Key Management

The **Encryption Key** card manages the AES-256-GCM key used to encrypt field-level data: TOTP secrets, CIFS/SFTP passwords, and backup archives.

| Action | Description |
|---|---|
| **Key Fingerprint** | First 16 hex characters of the SHA-256 hash of the active key. Use this to verify the key is the same across instances. |
| **Reveal Key** | Displays the raw base64-encoded key. Store it in a password vault — without it, encrypted backups cannot be decrypted on a different instance. |
| **Rotate Encryption Key** | Generates a new random key and re-encrypts all TOTP secrets, CIFS passwords, and backup archives in place. The old key is discarded. **Save the new key immediately after rotation.** |

> **Warning:** Key rotation is irreversible. If you lose the new key after rotating, all encrypted data is permanently unrecoverable.

---

## Dashboard Access

Controls which non-admin users can view the **Dashboard** (`/`). Admins always have full access.

### Allowed Users

Add individual usernames to grant dashboard view access. The list shows all non-admin users; select one and click **Add**. Remove a user by clicking the × on their badge.

If the list is empty, only admins can see the dashboard.

### AD Groups (Dashboard Viewers)

When Active Directory is enabled, members of listed AD groups automatically gain dashboard view access. Group membership is evaluated on each AD login.

Enter the full distinguished name of the AD group (e.g. `CN=DocViewers,OU=Groups,DC=example,DC=com`) and click **Add**.

Configuration is stored in the SQLite KV store under the key `dashboard-access.json`.

---

## Audit Settings

See [Admin — Audit](audit.md) for the audit logging configuration which lives in the Audit tab.
