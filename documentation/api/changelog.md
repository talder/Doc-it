# API — Change Log

Base path: `/api/changelog`

---

## GET /api/changelog

List change log entries with optional filtering.

**Query params**
- `q` — Search text
- `from` — Start date (YYYY-MM-DD)
- `to` — End date (YYYY-MM-DD)
- `category` — Disk | Network | Security | Software | Hardware | Configuration | Other
- `system` — System name filter
- `systems=1` — Return known system names only (for autocomplete)

**Response `200`**
```json
{
  "entries": [{
    "id": "CHG-000001",
    "date": "2026-04-15",
    "author": "admin",
    "system": "fw01",
    "category": "Network",
    "description": "Updated firewall rules",
    "impact": "Brief connectivity drop",
    "risk": "Medium",
    "status": "Completed",
    "createdAt": "..."
  }]
}
```

---

## POST /api/changelog

Create a new change log entry. Author is set to the current user.

**Request body**
```json
{
  "date": "2026-04-15",
  "system": "fw01",
  "category": "Network",
  "description": "Updated firewall rules for VLAN 42",
  "impact": "Brief connectivity drop during rule reload",
  "risk": "Medium",
  "status": "Completed"
}
```

**Validation:**
- `category` must be one of: Disk, Network, Security, Software, Hardware, Configuration, Other
- `risk` must be one of: Low, Medium, High, Critical
- `status` must be one of: Completed, Failed, Rolled Back
