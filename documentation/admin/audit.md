# Admin — Audit

The **Audit** tab (`/admin?tab=audit`) provides two sections: the **Event Explorer** and **Settings**.

---

## Event Explorer

### Calendar Heatmap

A monthly calendar showing colour-coded event density per day. Darker cells indicate more events.

Navigate months with the `‹` and `›` arrows. Click a day to pre-fill the date filter in the event table.


### Filter Bar

| Filter | Description |
|---|---|
| Date from / to | ISO date range |
| Event type | Select from the full list of 34 event types |
| Actor | Username (partial match) |
| Outcome | All / Success / Failure |
| Space | Filter to a specific space slug |
| Text search | Search across all fields |

Click **Search** to apply. Results are paginated at 50 per page.

### Event Table

Each row shows:
- Timestamp
- Event type (e.g. `doc.update`)
- Actor (username or service key prefix)
- Outcome
- Space
- Resource (document name, user, etc.)
- IP address

### Exporting

Click **Export CSV** or **Export JSON** to download the full filtered result set (no pagination applied to exports).

---

## Settings

Click the **Settings** sub-tab within the Audit tab to configure the audit system.


### Local File Settings

| Setting | Default | Description |
|---|---|---|
| Retention days | `365` | Daily log files older than this are deleted automatically |

### Syslog Forwarding (optional)

Enable to forward every audit event to a remote syslog server in **RFC 5424** format.

| Setting | Description |
|---|---|
| Enabled | Toggle syslog forwarding on/off |
| Host | Hostname or IP of syslog receiver |
| Port | Default `514` |
| Protocol | `udp` or `tcp` |
| Facility | Syslog facility code (e.g., `local0`) |
| App name | Identifies the source in syslog (default `doc-it`) |
| Hostname | Override the hostname field in RFC 5424 messages |

Click **Save Audit Config** to apply.

---

## Log Files on Disk

```
logs/
├── audit-2025-06-01.jsonl
├── audit-2025-06-02.jsonl
└── ...
```

Each line is a JSON object. See [Audit Logging feature docs](../features/audit-logging.md) for the full field reference.
