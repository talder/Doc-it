# Data Snapshots

Data snapshots provide lightweight, local-only copies of all application data directories for fast rollback — for example, before upgrading the application.

Unlike the [encrypted backup system](backup.md) (which creates compressed, encrypted archives for off-site storage), snapshots are designed for speed and are stored as plain directory copies.

---

## What Gets Snapshotted

The same directories as regular backups:

- `config/` — SQLite database, avatars, blobstore
- `docs/` — all documents and templates
- `logs/` — audit and crash log files
- `archive/` — archived documents
- `history/` — document revision snapshots

Snapshots are stored in the `snapshots/` directory at the project root.

---

## Automatic Pre-Upgrade Snapshots

All three installers (`install-linux.sh`, `install-mac.sh`, `install-windows.ps1`) automatically create a snapshot labelled `pre-upgrade` before pulling new code during `--upgrade`. This means you can always roll back to the state just before an upgrade.

On Linux, snapshots use `cp -al` (hard links) for near-instant creation and near-zero extra disk usage. On macOS and Windows, a regular recursive copy is used.

Old snapshots are automatically pruned to keep only the 5 most recent.

---

## Managing Snapshots in the Admin UI

Go to **Admin → Backup** and scroll to the **Data Snapshots** card.

### Create a Snapshot

Click **Create Snapshot** to take a manual snapshot. Useful before making risky changes to configuration or documents.

### Restore a Snapshot

Click the restore icon next to any snapshot. A confirmation dialog warns that current data will be overwritten. A **pre-restore** snapshot is automatically created first as a safety net — so you can always undo a restore.

### Delete a Snapshot

Click the trash icon to remove a snapshot you no longer need.

---

## API Endpoints

All endpoints require admin authentication.

### List Snapshots

```
GET /api/admin/snapshots
```

Returns `{ snapshots: SnapshotEntry[] }`.

### Create Snapshot

```
POST /api/admin/snapshots
Content-Type: application/json

{ "label": "manual" }
```

Returns `{ success: true, snapshot: SnapshotEntry }`. Auto-prunes to keep the 10 most recent.

### Restore Snapshot

```
POST /api/admin/snapshots/:id/restore
```

Creates a pre-restore safety snapshot, then replaces current data directories.

### Delete Snapshot

```
DELETE /api/admin/snapshots/:id
```

---

## Snapshot ID Format

Snapshot IDs follow the pattern `YYYY-MM-DDTHH-MM-SS_label`, e.g.:

```
2026-03-26T08-50-00_pre-upgrade
2026-03-26T09-15-30_manual
2026-03-26T09-20-00_pre-restore
```

---

## Audit Events

Snapshot operations are logged as audit events:

- `snapshot.create` — a snapshot was created
- `snapshot.restore` — a snapshot was restored
- `snapshot.delete` — a snapshot was deleted
