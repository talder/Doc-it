# Audit Logging

doc-it includes a mandatory, always-on audit logging system designed to meet NIS2 and similar compliance requirements. Every security-relevant event is recorded in a tamper-evident JSONL log file.

---

## What Gets Logged

34 distinct event types are captured:

**Authentication**
- `auth.login.success`, `auth.login.failure`, `auth.logout`, `auth.register`, `auth.setup`

**Documents**
- `doc.read`, `doc.create`, `doc.update`, `doc.delete`
- `doc.archive`, `doc.unarchive`, `doc.move`, `doc.rename`
- `doc.status.change`, `doc.history.restore`

**Spaces**
- `space.create`, `space.update`, `space.delete`
- `space.member.add`, `space.member.remove`, `space.member.update`

**Users & Keys**
- `user.create`, `user.update`, `user.delete`
- `apikey.create`, `apikey.delete`
- `servicekey.create`, `servicekey.delete`

**Settings**
- `settings.smtp.update`, `settings.audit.update`

---

## Log Format

Each event is a single JSON line:

```json
{
  "id": "01HXY...",
  "timestamp": "2025-06-01T12:34:56.789Z",
  "event": "doc.update",
  "actor": "alice",
  "actorType": "user",
  "outcome": "success",
  "spaceSlug": "engineering",
  "resourceType": "doc",
  "resourceId": "my-doc",
  "meta": { "category": "guides" },
  "ip": "127.0.0.1",
  "userAgent": "Mozilla/5.0 ..."
}
```

---

## Log Files

Logs rotate daily: `logs/audit-YYYY-MM-DD.jsonl`

Old files are automatically deleted when they exceed the configured **retention period** (default 365 days).

---

## Syslog Forwarding

Optionally forward audit events to a remote syslog server in RFC 5424 format over UDP or TCP. Configure this in **Admin → Audit → Settings**.

---

## Viewing Logs in the Admin UI

Go to **Admin → Audit** to access the Event Explorer.


### Calendar Heatmap
A monthly calendar showing event density per day. Click a day to filter the event table to that date.

### Event Explorer Table
Filterable, paginated table of all audit events. Filter by:
- Date range
- Event type
- Actor (username)
- Outcome (success / failure)
- Space

### Exporting Logs
Click **Export CSV** or **Export JSON** to download filtered results.

---

## Audit Settings


| Setting | Description |
|---|---|
| Retention days | How many days to keep daily log files (default 365) |
| Syslog enabled | Whether to forward events to a syslog server |
| Syslog host | Hostname or IP of the syslog receiver |
| Syslog port | Default 514 |
| Protocol | `udp` or `tcp` |
| Facility | Syslog facility (e.g. `local0`) |
| App name | Syslog app name tag (default `doc-it`) |

---

## NIS2 Compliance

See [Security — NIS2 Compliance](../security/nis2-compliance.md) for a full compliance mapping.
