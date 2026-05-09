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

## On-Call Reports

Configure access and weekly email digest for the On-Call Reports module (visible in the **Settings** tab).

| Field | Description |
|---|---|
| **Allowed Users** | Users who can access and create on-call reports. Admins always have access. |
| **Enable weekly email digest** | Send a Monday morning summary of last week's calls. Requires SMTP. |
| **Send time** | Time of day to send the digest (HH:MM). |
| **Recipients** | Email addresses to receive the weekly digest. |

---

## VMware Inventory

The **VMware** tab (`/admin?tab=vmware`) configures the VMware Inventory module. See [VMware Inventory](../features/vmware-inventory.md) for full feature documentation.

| Field | Description |
|---|---|
| **Enable** | Master switch for the VMware Inventory module. |
| **vCenter URL** | Full URL including protocol, e.g. `https://vcenter.example.com`. |
| **Username** | vCenter username, e.g. `administrator@vsphere.local`. |
| **Password** | Stored AES-256-GCM encrypted at rest. Leave blank to keep the existing password. |
| **Ignore SSL errors** | Skip certificate verification for self-signed vCenter certificates. |
| **Allowed Users** | Non-admin users who can access the VMware Inventory page. |
| **Cache TTL (minutes)** | How long to cache the inventory (default 15). Set to 0 to disable caching. |
| **Weekly Report — Enable** | Send a weekly HTML email with the full inventory summary. |
| **Weekly Report — Day** | Day of the week to send the report (Sun–Sat). |
| **Weekly Report — Time** | Time of day to send the report (HH:MM). |
| **Weekly Report — Recipients** | Email addresses that receive the report. |

Use **Test Connection** to verify credentials before saving. SMTP must be configured for the weekly report to be delivered.

Configuration is stored in the SQLite KV store under `vmware-config.json`. The inventory cache is stored under `vmware-inventory-cache.json`.

---

## Audit Settings

See [Admin — Audit](audit.md) for the audit logging configuration which lives in the Audit tab.
