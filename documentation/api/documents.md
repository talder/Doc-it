# API — Documents

Base path: `/api/spaces/:slug/docs`

---

## GET /api/spaces/:slug/docs

List all documents in the space (excluding archived).

**Query params**
- `category` (optional) — filter by category path

**Response `200`**
```json
[
  { "name": "intro", "filename": "intro.md", "category": "guides", "space": "engineering" }
]
```

---

## POST /api/spaces/:slug/docs

Create a new document.

**Request body**
```json
{
  "name": "My New Doc",
  "category": "guides",
  "isTemplate": false
}
```

**Response `201`**
```json
{ "name": "my-new-doc", "filename": "my-new-doc.md", "category": "guides" }
```

---

## GET /api/spaces/:slug/docs/:name

Read a document's content and metadata.

**Query params**
- `category` (required)
- `isTemplate` (optional, `"true"`)

**Response `200`**
```json
{
  "content": "# Hello World\n...",
  "metadata": { "tags": ["engineering"], "customProperties": {} },
  "fileSize": 1024
}
```

---

## PUT /api/spaces/:slug/docs/:name

Update (save) a document's content and/or metadata.

**Request body**
```json
{
  "content": "# Updated content\n...",
  "category": "guides",
  "metadata": { "tags": ["engineering", "onboarding"] },
  "isTemplate": false
}
```

---

## DELETE /api/spaces/:slug/docs/:name

Permanently delete a document.

**Query params**
- `category` (required)

---

## POST /api/spaces/:slug/docs/:name/archive

Archive (soft-delete) a document.

**Request body**
```json
{ "category": "guides" }
```

---

## POST /api/spaces/:slug/docs/:name/unarchive

Restore an archived document.

**Request body**
```json
{ "category": "guides" }
```

---

## POST /api/spaces/:slug/docs/:name/move

Move a document to another category.

**Request body**
```json
{ "fromCategory": "guides", "toCategory": "reference" }
```

---

## POST /api/spaces/:slug/docs/:name/rename

Rename a document.

**Request body**
```json
{ "newName": "Getting Started", "category": "guides", "isTemplate": false }
```

**Response `200`**
```json
{ "name": "getting-started" }
```

---

## GET /api/spaces/:slug/docs/:name/status

Get the workflow status of a document.

**Query params**
- `category` (required)

**Response `200`**
```json
{ "status": "draft", "reviewer": null }
```

---

## PUT /api/spaces/:slug/docs/:name/status

Set the workflow status.

**Request body**
```json
{ "category": "guides", "status": "in-review", "reviewer": "alice" }
```

---

## GET /api/spaces/:slug/docs/:name/history

List all revisions of a document.

**Query params**
- `category` (required)

**Response `200`**
```json
[
  { "rev": 1, "author": "tim", "timestamp": "2025-06-01T10:00:00Z" },
  { "rev": 2, "author": "alice", "timestamp": "2025-06-02T14:30:00Z" }
]
```

---

## POST /api/spaces/:slug/docs/:name/history

Create a revision snapshot manually.

**Request body**
```json
{ "content": "# ...", "category": "guides", "username": "alice" }
```

**Response `200`**
```json
{ "created": true, "rev": 3 }
```

---

## POST /api/spaces/:slug/docs/:name/history/:rev/restore

Restore a document to a specific revision.

**Request body**
```json
{ "category": "guides", "username": "alice" }
```

---

## GET /api/spaces/:slug/archive

List all archived documents.

**Response `200`**
```json
[{ "name": "old-doc", "category": "guides", "archivedAt": "2025-05-01T..." }]
```
