# Change Log

The Change Log provides an operational change tracking register for recording infrastructure and configuration changes. Entries are immutable once created — they cannot be edited or deleted.

---

## Creating a Change Entry

1. Open **Change Log** from the sidebar or admin area.
2. Click **+ New Change**.
3. Fill in the fields:

| Field | Description |
|---|---|
| Date | When the change was made (YYYY-MM-DD) |
| System | Free-text asset or hostname (autocomplete from previous entries) |
| Category | `Disk`, `Network`, `Security`, `Software`, `Hardware`, `Configuration`, or `Other` |
| Description | What was changed |
| Impact | Expected or actual impact |
| Risk | `Low`, `Medium`, `High`, or `Critical` |
| Status | `Completed`, `Failed`, or `Rolled Back` |
| Linked Doc | Optionally link to a doc-it document for details |

4. Click **Save**. The entry receives an auto-incrementing ID (e.g., `CHG-000001`).

The **Author** field is filled automatically from the logged-in user.

---

## Viewing & Filtering

The Change Log shows all entries in reverse chronological order. Filter by:
- Date range
- Category
- System name
- Free-text search (searches ID, system, description, impact, category, and author)

---

## Syslog Forwarding

When syslog forwarding is enabled in **Admin → Audit → Settings**, every new change entry is also forwarded to the configured syslog server with a `[CHANGE]` marker in RFC 5424 format. This allows SIEM systems to ingest operational changes alongside audit events.

---

## Retention

Entries older than the configured retention period are automatically pruned each time a new entry is added. The default is **5 years**. Adjust this in **Admin → Settings → Change Log** or via the API (`PUT /api/settings/changelog`).

---

## Storage

Change log data is stored in the SQLite KV store under the key `changelog.json`. The data includes a `nextNumber` counter and an `entries` array. Retention settings are stored under `changelog-settings.json`.
