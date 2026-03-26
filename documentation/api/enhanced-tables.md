# API — Enhanced Tables

Base path: `/api/spaces/:slug/enhanced tables`

---

## GET /api/spaces/:slug/enhanced tables

List all enhanced tables in the space.

**Response `200`**
```json
[
  { "id": "abc123", "title": "Project Tracker", "rowCount": 42, "createdAt": "..." }
]
```

---

## POST /api/spaces/:slug/enhanced tables

Create a new enhanced table.

**Request body**
```json
{ "title": "Project Tracker", "templateId": null }
```

**Response `201`**
```json
{ "id": "abc123", "title": "Project Tracker" }
```

---

## GET /api/spaces/:slug/enhanced tables/:id

Get the schema and metadata for a enhanced table.

---

## PUT /api/spaces/:slug/enhanced tables/:id

Update the enhanced table title.

**Request body**
```json
{ "title": "Updated Title" }
```

---

## DELETE /api/spaces/:slug/enhanced tables/:id

Delete a enhanced table and all its rows. Irreversible.

---

## GET /api/spaces/:slug/enhanced tables/:id/schema

Return the column definitions.

**Response `200`**
```json
{
  "columns": [
    { "id": "col1", "name": "Title", "type": "text", "options": null }
  ]
}
```

---

## PUT /api/spaces/:slug/enhanced tables/:id/schema

Replace the column definitions.

---

## GET /api/spaces/:slug/enhanced tables/:id/rows

List all rows. Supports filtering, sorting, and search via query params.

**Query params**
- `search` — full-text search
- `filterCol` + `filterVal` — filter by column value
- `sortCol` + `sortDir` — sort (`asc` / `desc`)

---

## POST /api/spaces/:slug/enhanced tables/:id/rows

Create a new row.

**Request body**
```json
{ "data": { "col1": "My Task", "col2": "in-progress" } }
```

---

## PUT /api/spaces/:slug/enhanced tables/:id/rows/:rowId

Update a row.

**Request body**
```json
{ "data": { "col2": "done" } }
```

---

## DELETE /api/spaces/:slug/enhanced tables/:id/rows/:rowId

Delete a row.
