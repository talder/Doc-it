# API — On-Call Reports

Base path: `/api/oncall`

Requires on-call access (admin or allowed user).

---

## GET /api/oncall

List on-call entries with optional filtering.

**Query params**
- `from` — Start date (YYYY-MM-DD)
- `to` — End date (YYYY-MM-DD)
- `q` — Search text (searches ID, registrar, description, solution)

**Response `200`**
```json
{ "entries": [{ "id": "ONC-000001", "registrar": "admin", "date": "2026-04-15", "time": "03:15", "description": "...", "workingMinutes": 45, "assistedBy": [], "solution": "", "createdAt": "...", "updatedAt": "..." }] }
```

---

## POST /api/oncall

Create a new on-call entry. The registrar is automatically set to the current user.

**Request body**
```json
{
  "date": "2026-04-15",
  "time": "03:15",
  "description": "DNS server unresponsive",
  "workingTime": "1h30m",
  "solution": "Restarted DNS service",
  "assistedBy": ["alice", "bob"]
}
```

**Response `201`**
```json
{ "entry": { "id": "ONC-000042", "registrar": "admin", ... } }
```

---

## GET /api/oncall/:id

Get a single on-call entry by ID.

**Response `200`**
```json
{ "entry": { "id": "ONC-000001", ... } }
```

---

## PATCH /api/oncall/:id

Update the solution field only. All other fields are immutable after creation.

**Request body**
```json
{ "solution": "Root cause was a misconfigured firewall rule" }
```

---

## DELETE /api/oncall/:id

Delete an on-call entry. **Admin only.**

---

## GET /api/oncall/stats

Get statistics and heatmap data.

**Query params**
- `days` — Heatmap period in days (default: 90)

**Response `200`**
```json
{
  "totalEntries": 42,
  "totalWorkingTime": "28h15m",
  "totalWorkingMinutes": 1695,
  "byRegistrar": { "admin": { "count": 20, "totalMinutes": 800 } },
  "topAssisted": [["alice", 5], ["bob", 3]],
  "heatmap": { "2026-04-15": 2, "2026-04-14": 0 }
}
```

---

## GET /api/oncall/users

List users available for the assisted-by picker.

**Response `200`**
```json
{ "users": [{ "username": "admin", "fullName": "Administrator" }] }
```

---

## GET /api/oncall/settings

Get on-call settings. **Admin only.**

---

## PUT /api/oncall/settings

Update on-call settings. **Admin only.**

**Request body**
```json
{
  "allowedUsers": ["admin", "alice"],
  "emailEnabled": true,
  "emailRecipients": ["team@example.com"],
  "emailSendTime": "08:00"
}
```
