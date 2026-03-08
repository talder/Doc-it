# API — Audit

All audit endpoints require **admin** authentication.

---

## GET /api/audit

Query audit log entries with optional filters. Returns paginated results.

**Query params**

| Param | Description |
|---|---|
| `page` | Page number (default `1`) |
| `pageSize` | Results per page (default `50`) |
| `dateFrom` | ISO date string, inclusive lower bound |
| `dateTo` | ISO date string, inclusive upper bound |
| `event` | Filter by event type (e.g. `doc.update`) |
| `actor` | Filter by username |
| `outcome` | `success` or `failure` |
| `spaceSlug` | Filter by space |
| `text` | Full-text search across all fields |
| `format` | `json` (default) or `csv` — export full result set |

**Response `200` (JSON)**
```json
{
  "entries": [
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
      "ip": "127.0.0.1"
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 50
}
```

**Export as CSV**

Add `?format=csv` to download a CSV file of the filtered results (ignores `page`/`pageSize`).

---

## GET /api/audit/calendar

Return per-day event counts for a given year/month. Used to render the calendar heatmap.

**Query params**
- `year` — 4-digit year (default: current year)
- `month` — 1–12 (default: current month)

**Response `200`**
```json
{
  "year": 2025,
  "month": 6,
  "counts": {
    "2025-06-01": 23,
    "2025-06-02": 7
  }
}
```
