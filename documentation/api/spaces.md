# API — Spaces

## GET /api/spaces

Return all spaces the authenticated user has access to.

**Response `200`**
```json
[
  { "slug": "engineering", "name": "Engineering", "permissions": { "alice": "writer" } }
]
```

---

## POST /api/spaces *(admin only)*

Create a new space.

**Request body**
```json
{ "name": "Engineering" }
```

**Response `201`**
```json
{ "slug": "engineering", "name": "Engineering", "permissions": {} }
```

---

## PUT /api/spaces/:slug *(admin only)*

Update a space's name or permissions.

**Request body** (all fields optional)
```json
{
  "name": "Engineering Team",
  "permissions": { "alice": "writer", "bob": "reader" }
}
```

---

## DELETE /api/spaces/:slug *(admin only)*

Delete a space and all its contents. This is irreversible.

---

## GET /api/spaces/:slug/members

Return all users assigned to the space with their roles.

```json
[
  { "username": "alice", "role": "writer", "fullName": "Alice Smith" }
]
```

---

## GET /api/spaces/:slug/customization

Return the space's icon/colour customisation map for documents and categories.

---

## PATCH /api/spaces/:slug/customization

Update customisation entries. Accepts partial updates.

**Request body** (all fields optional)
```json
{
  "docIcons":       { "guides/intro": "📘" },
  "docColors":      { "guides/intro": "#6366f1" },
  "categoryIcons":  { "guides": "📁" },
  "categoryColors": { "guides": "#f59e0b" }
}
```

---

## GET /api/spaces/:slug/statuses

Return a map of `category/docName → { status, reviewer }` for all documents in the space.

---

## GET /api/spaces/:slug/reviews

Return all documents in `in-review` status where the current user is the assigned reviewer.
