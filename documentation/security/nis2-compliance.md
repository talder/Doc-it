# NIS2 Compliance

doc-it's audit logging system is designed to support compliance with the **EU NIS2 Directive** (Network and Information Security Directive 2) and similar security-logging frameworks (ISO 27001, SOC 2, GDPR Article 32).

---

## Mandatory Logging

Audit logging in doc-it is **always on and cannot be disabled**. Every security-relevant action is recorded immediately in an append-only JSONL file. This satisfies the NIS2 requirement for continuous logging of access and modification events.

---

## NIS2 Article Mapping

| NIS2 Requirement | doc-it Implementation |
|---|---|
| Art. 21(2)(b) — Incident handling | All failures and errors are logged with `outcome: "failure"` |
| Art. 21(2)(e) — Access control | All authentication events (`auth.login.*`, `auth.logout`) are logged with actor, IP, and user agent |
| Art. 21(2)(g) — Encryption / access policies | Permission changes (`space.member.*`, `user.*`) are logged |
| Art. 21(2)(h) — HR security | User creation, update, deletion events are logged |
| Art. 23 — Reporting obligations | Audit log export (CSV/JSON) supports rapid incident reporting |

---

## Covered Event Categories

### Authentication (5 events)
- `auth.login.success` — successful login with username, IP, user agent
- `auth.login.failure` — failed login attempt with username and IP
- `auth.logout` — session termination
- `auth.register` — new user registration
- `auth.setup` — initial system setup

### Document Access & Modification (10 events)
- `doc.read`, `doc.create`, `doc.update`, `doc.delete`
- `doc.archive`, `doc.unarchive`, `doc.move`, `doc.rename`
- `doc.status.change`, `doc.history.restore`

### Space Administration (6 events)
- `space.create`, `space.update`, `space.delete`
- `space.member.add`, `space.member.remove`, `space.member.update`

### User & Key Management (7 events)
- `user.create`, `user.update`, `user.delete`
- `apikey.create`, `apikey.delete`
- `servicekey.create`, `servicekey.delete`

### System Configuration (2 events)
- `settings.smtp.update`
- `settings.audit.update`

---

## Log Integrity

- Each log entry contains a **ULID** as a unique, time-ordered identifier.
- Log files are appended to atomically — existing lines are never modified.
- Retention cleanup only deletes entire day files past the retention window; it never modifies file contents.

---

## Log Retention

Default retention is **365 days**. This meets the minimum recommended log retention period for NIS2 incident investigation. For critical infrastructure, increase the retention period in **Admin → Audit → Settings**.

---

## Syslog Integration

For environments requiring centralised SIEM integration, doc-it can forward all events to a remote syslog receiver in **RFC 5424** format (UDP or TCP). This allows feeding into:
- Splunk, Graylog, ELK Stack, QRadar, etc.

---

## Exporting for Auditors

Go to **Admin → Audit**, apply any required filters (e.g., date range, event type), and click **Export CSV** or **Export JSON**. The export contains the full unredacted event log for the selected period.

---

## Recommendations for Full NIS2 Compliance

1. Enable syslog forwarding to a tamper-proof SIEM.
2. Set retention to at least 365 days (default).
3. Restrict admin access to the minimum number of accounts.
4. Review authentication failure events (`auth.login.failure`) regularly.
5. Rotate service keys annually or on personnel changes.
