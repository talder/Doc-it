# Admin — Spaces

The **Spaces** tab (`/admin?tab=spaces`) lets admins create spaces, manage their members, and delete them.


---

## Creating a Space

1. Click **New Space**.
2. Enter a name. The slug is auto-generated (e.g., "Engineering Team" → `engineering-team`).
3. Click **Create**.

---

## Managing Members

Click **Edit** on a space to expand the member management panel. 

To add a user:
1. Select a username from the dropdown.
2. Choose a role: `reader` or `writer`.
3. Click **Add**.

To change a role, re-add the same user with a different role.

To remove a user, click the **×** next to their entry.

---

## Roles

| Role | Description |
|---|---|
| `reader` | Can view all documents in the space, cannot edit |
| `writer` | Can create, edit, move, delete documents and categories |

Admin users always have implicit `writer` access to all spaces regardless of permissions.

---

## Deleting a Space

Click the **Delete** (trash) icon next to a space. This permanently deletes all documents, categories, databases, templates, and tags in the space. This action cannot be undone.

---

## Space Slugs

The slug is used in all API paths (e.g., `/api/spaces/engineering/docs`). It cannot be changed after creation.
