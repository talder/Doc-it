# Backup & Recovery

doc-it includes an automated backup system that creates **AES-256-GCM encrypted** archives of all application data. Backups can be stored locally and optionally copied to remote targets.

---

## What Gets Backed Up

The following directories are included in each backup archive:

| Directory | Contents |
|---|---|
| `config/` | SQLite database (users, settings, helpdesk, assets, etc.) |
| `docs/` | All documents, templates, databases, and attachments |
| `logs/` | Audit log files |
| `archive/` | Archived (soft-deleted) documents |
| `history/` | Document revision snapshots |

---

## Backup Configuration

Configure backups in **Admin → Backup** (or via the API).

| Setting | Description |
|---|---|
| Enabled | Whether scheduled backups are active |
| Schedule | `manual`, `daily`, or `weekly` |
| Schedule time | Time of day to run (e.g., `02:00`) |
| Day of week | For weekly schedule (0 = Sunday, 1 = Monday, etc.) |
| Retention count | Number of backup files to keep (older ones are deleted) |

---

## Backup Targets

In addition to the local `backups/` directory, you can configure targets to copy each backup to:

### Local Path
Copy the backup file to a directory on the local filesystem (e.g., a mounted NFS share).

### CIFS / SMB
Copy the backup file directly to a Windows / Samba share using `smbclient`. Configure:
- Share path (e.g., `//server/share/backups`)
- Username and password (password is encrypted at rest)
- Domain (optional)

### SFTP
Copy the backup file to a remote server over SSH using `ssh2`. Configure:

| Field | Description |
|---|---|
| Host | SFTP server hostname or IP |
| Port | Default `22` |
| Username | SSH username |
| Password | SSH password (stored encrypted at rest; mutually exclusive with private key) |
| Private key | PEM private key (stored encrypted at rest; mutually exclusive with password) |
| Remote path | Destination directory on the server (e.g., `/backups/docit/`) |

---

## Running a Backup Manually

Go to **Admin → Backup** and click **Run Backup Now**. The backup runs immediately regardless of the schedule setting.

---

## Backup Files

Backups are stored in the `backups/` directory at the project root:

```
backups/
├── docit-backup-2025-06-01T02-00-00.tar.gz.enc
├── docit-backup-2025-06-02T02-00-00.tar.gz.enc
└── ...
```

Each file is a tar.gz archive encrypted with AES-256-GCM using the application's secret key. The file format is: `16-byte IV | encrypted data | 16-byte auth tag`.

---

## Encryption

All backup archives are encrypted at rest using the same AES-256-GCM key used for field-level encryption (`SECRET_FIELD_KEY` or the auto-generated key in `config/docit.db`). The unencrypted tar.gz is deleted immediately after encryption.

---

## Storage

Backup configuration is stored in the SQLite KV store under the key `backup.json`. Backup run state (last run timestamp) is stored under `backup-state.json`. CIFS and SFTP credentials are stored AES-256-GCM encrypted within the backup configuration.

---

## See Also

- [Data Snapshots](snapshots.md) — lightweight local snapshots for fast rollback (e.g. before upgrades). Unlike encrypted backups, snapshots are unencrypted directory copies optimised for speed.
