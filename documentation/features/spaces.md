# Spaces

A **Space** is an isolated workspace. Each space has its own documents, categories, templates, databases, and tags. Users are assigned to spaces with a specific role.

---

## Roles

| Role | Capabilities |
|---|---|
| `reader` | View and read documents; cannot create, edit, or delete |
| `writer` | Full read + create/edit/delete documents, categories, templates, databases |
| `admin` | Super-admin — implicit writer access to all spaces |

---

## Switching Spaces

The current space name is shown in the **top bar**. Click it to open the space-switcher dropdown and select another space you have access to.

---

## Creating a Space (Admin only)

1. Go to **Admin → Spaces**.
2. Click **New Space**.
3. Enter a name. A URL-safe slug is generated automatically.
4. Add users and assign roles.
5. Click **Create**.


---

## Customisation

Spaces support per-item customisation:

- **Document icons** — assign an emoji to any document; shown in the sidebar.
- **Document colour** — assign a colour to highlight a document in the sidebar.
- **Category icons** — assign an emoji to any category.
- **Category colour** — assign a colour to a category heading.

Right-click (or use the `…` menu) on a document or category in the sidebar to access these options.

---

## Space Members

The space `members` endpoint returns all users assigned to a space. This list is used in the document review workflow to select reviewers.

---

## Archiving Documents

Documents in a space can be archived (soft-deleted). Archived documents are hidden from the sidebar but are preserved on disk. Use **Archive** (accessible from the topbar) to view and restore archived documents.

