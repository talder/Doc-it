# API — Enhanced Tables

Base path: `/api/spaces/:slug/enhanced-tables`

All endpoints require at least `reader` role on the space unless noted otherwise.

---

## Tables

### GET /api/spaces/:slug/enhanced-tables

List all enhanced tables in the space.

**Response `200`**
```json
[
  { "id": "abc123", "title": "Project Tracker", "rowCount": 42, "createdAt": "..." }
]
```

---

### POST /api/spaces/:slug/enhanced-tables

Create a new enhanced table. Requires `writer` role.

**Request body**
```json
{ "title": "Project Tracker", "templateId": "bug-tracker" }
```

`templateId` is optional. Available templates: `bug-tracker`, `meeting-notes`, `project-tracker`, `content-calendar`, `contact-list`. Templates include pre-configured columns and sample rows.

**Response `201`**
```json
{ "id": "abc123", "title": "Project Tracker" }
```

---

### GET /api/spaces/:slug/enhanced-tables/:id

Get the full enhanced table (schema, rows, views, webhooks).

---

### PUT /api/spaces/:slug/enhanced-tables/:id

Update the enhanced table. Requires `writer` role.

**Request body** (all fields optional)
```json
{ "title": "Updated Title", "columns": [...], "views": [...], "rows": [...], "tags": ["tag1"] }
```

---

### DELETE /api/spaces/:slug/enhanced-tables/:id

Delete an enhanced table and all its rows. Requires `admin` role. Irreversible.

---

## Rows

### GET /api/spaces/:slug/enhanced-tables/:id/rows

List all rows.

---

### POST /api/spaces/:slug/enhanced-tables/:id/rows

Create a new row. Requires `writer` role.

**Request body**
```json
{ "cells": { "col1": "My Task", "col2": "in-progress" } }
```

**Auto-populated fields**: `createdBy` columns are set to the current user. `autoIncrement` columns are assigned the next sequential value.

If the table has webhooks configured with the `create` event, they are fired after the row is saved.

**Response `201`** — the created row object.

---

### PUT /api/spaces/:slug/enhanced-tables/:id/rows/:rowId

Update a row (partial). Requires `writer` role.

**Request body**
```json
{ "cells": { "col2": "done" } }
```

Bidirectional relation columns are automatically synced. Webhooks with the `update` event are fired.

---

### DELETE /api/spaces/:slug/enhanced-tables/:id/rows/:rowId

Delete a row. Requires `writer` role. Bidirectional reverse references are cleaned up. Webhooks with the `delete` event are fired.

---

### GET /api/spaces/:slug/enhanced-tables/:id/rows/lookup

Resolve display labels for relation row IDs.

**Query params**
- `columnId` — the relation column ID on this table
- `rowIds` — comma-separated target row IDs

**Response `200`**
```json
{ "labels": { "rowId1": "Display Label", "rowId2": "Another Label" } }
```

---

### GET /api/spaces/:slug/enhanced-tables/:id/rows/:rowId/preview

Get a lightweight preview of a single row (first 5 non-relation columns). Used by the relation chip hover card.

**Response `200`**
```json
{
  "tableTitle": "Contacts",
  "rowId": "abc123",
  "fields": [
    { "name": "Name", "type": "text", "value": "John Doe" },
    { "name": "Email", "type": "email", "value": "john@example.com" }
  ]
}
```

---

## Revision History

Every write operation creates an automatic snapshot before saving. Up to 50 revisions are retained.

### GET /api/spaces/:slug/enhanced-tables/:id/history

List revision snapshots, newest first.

**Response `200`**
```json
{
  "revisions": [
    { "filename": "2026-04-15T10-30-00.000Z.json", "timestamp": "2026-04-15T10:30:00.000Z", "rowCount": 42, "columnCount": 8 }
  ]
}
```

---

### POST /api/spaces/:slug/enhanced-tables/:id/history

Restore a revision. Requires `admin` role. The current state is saved as a new revision before restoring.

**Request body**
```json
{ "filename": "2026-04-15T10-30-00.000Z.json" }
```

**Response `200`**
```json
{ "success": true }
```

---

## Webhooks

All webhook endpoints require `admin` role.

### GET /api/spaces/:slug/enhanced-tables/:id/webhooks

List configured webhooks.

**Response `200`**
```json
{
  "webhooks": [
    { "id": "wh1", "url": "https://example.com/hook", "events": ["create", "update"], "enabled": true }
  ]
}
```

---

### POST /api/spaces/:slug/enhanced-tables/:id/webhooks

Create a new webhook.

**Request body**
```json
{ "url": "https://example.com/hook", "events": ["create", "update", "delete"], "enabled": true }
```

**Response `201`** — the created webhook object.

---

### PUT /api/spaces/:slug/enhanced-tables/:id/webhooks

Update a webhook.

**Request body**
```json
{ "id": "wh1", "url": "https://new-url.com/hook", "events": ["create"], "enabled": false }
```

All fields except `id` are optional.

---

### DELETE /api/spaces/:slug/enhanced-tables/:id/webhooks

Delete a webhook.

**Request body**
```json
{ "id": "wh1" }
```

**Response `200`**
```json
{ "success": true }
```
