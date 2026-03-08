# API — Categories

Categories are folder-like hierarchies within a space. A category path uses `/` as a separator (e.g., `guides/advanced`).

Base path: `/api/spaces/:slug/categories`

---

## GET /api/spaces/:slug/categories

List all categories in the space.

**Response `200`**
```json
[
  { "name": "Guides", "path": "guides" },
  { "name": "Advanced", "path": "guides/advanced" }
]
```

---

## POST /api/spaces/:slug/categories

Create a new category. Writers only.

**Request body**
```json
{ "name": "API Reference", "parent": "guides" }
```

Omit `parent` to create a root-level category.

---

## PUT /api/spaces/:slug/categories/:path

Rename a category. The path parameter is the current full path (URL-encoded).

**Request body**
```json
{ "newName": "Reference" }
```

---

## DELETE /api/spaces/:slug/categories/:path

Delete a category and all documents inside it. Irreversible. Writers only.

---

## Tags

### GET /api/spaces/:slug/tags

Return the full tag index for the space.

```json
{
  "engineering": { "docNames": ["intro", "architecture"] },
  "engineering/backend": { "docNames": ["api-design"] }
}
```

### POST /api/spaces/:slug/tags

Trigger a full reindex of all tags in the space. Returns the updated index.
