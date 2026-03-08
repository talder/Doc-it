# API — Databases

Base path: `/api/spaces/:slug/databases`

---

## GET /api/spaces/:slug/databases

List all databases in the space.

**Response `200`**
```json
[
  { "id": "abc123", "title": "Project Tracker", "rowCount": 42, "createdAt": "..." }
]
```

---

## POST /api/spaces/:slug/databases

Create a new database.

**Request body**
```json
{ "title": "Project Tracker", "templateId": null }
```

**Response `201`**
```json
{ "id": "abc123", "title": "Project Tracker" }
```

---

## GET /api/spaces/:slug/databases/:id

Get the schema and metadata for a database.

---

## PUT /api/spaces/:slug/databases/:id

Update the database title.

**Request body**
```json
{ "title": "Updated Title" }
```

---

## DELETE /api/spaces/:slug/databases/:id

Delete a database and all its rows. Irreversible.

---

## GET /api/spaces/:slug/databases/:id/schema

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

## PUT /api/spaces/:slug/databases/:id/schema

Replace the column definitions.

---

## GET /api/spaces/:slug/databases/:id/rows

List all rows. Supports filtering, sorting, and search via query params.

**Query params**
- `search` — full-text search
- `filterCol` + `filterVal` — filter by column value
- `sortCol` + `sortDir` — sort (`asc` / `desc`)

---

## POST /api/spaces/:slug/databases/:id/rows

Create a new row.

**Request body**
```json
{ "data": { "col1": "My Task", "col2": "in-progress" } }
```

---

## PUT /api/spaces/:slug/databases/:id/rows/:rowId

Update a row.

**Request body**
```json
{ "data": { "col2": "done" } }
```

---

## DELETE /api/spaces/:slug/databases/:id/rows/:rowId

Delete a row.
