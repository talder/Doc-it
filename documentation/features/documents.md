# Documents

Documents are the core content unit in doc-it. Each document is a Markdown file stored inside a **Space** under a **Category**.

---

## Creating a Document

1. Click **+ New Document** in the sidebar (or the `+` icon next to a category).
2. Enter a name and select a category.
3. Optionally pick a template to pre-fill content.
4. Click **Create**. The document opens in edit mode.


---

## Document Bar

When a document is open, the horizontal bar above the editor shows:

| Element | Description |
|---|---|
| Breadcrumb | `Category / Document name` |
| Width toggle | Narrow / Wide / Max page width |
| Revision chip | `Rev N` — click to open revision history |
| Status badge | Current workflow status (draft / in-review / published) |
| Tag chips | Tags attached to the document |
| Tag adder `+` | Add a new tag |
| Book icon | Open reading view |
| Actions menu `…` | Edit, Distraction-free, Copy Markdown, Print, History, Move, Archive, Delete, Favourite |

---

## Doc Actions Menu

Click the `…` (More actions) button to access all document operations.


| Action | Description |
|---|---|
| Edit | Enter edit mode |
| Distraction-free | Full-screen editing overlay |
| Copy Markdown | Copy raw Markdown to clipboard |
| Print | Open browser print dialog |
| History | Open revision history |
| Move | Move document to another category |
| Archive | Soft-delete the document |
| Delete | Permanently delete the document |
| Favourite | Pin to the Favourites section in the sidebar |

---

## Document Status Workflow

Every non-template document has a status:

| Status | Meaning |
|---|---|
| `draft` | Work in progress |
| `in-review` | Submitted for review; a reviewer may be assigned |
| `published` | Approved and live |

Click the **status badge** in the document bar to open the status popover.


Writers can:
- Change the status to any value.
- Assign a reviewer (only available when setting to `in-review`).

Reviewers (readers with an assignment) can approve or reject review requests.

---

## Tags

Tags organise documents across categories. A tag uses `#parent/child` hierarchical syntax.


- Click the `+` button in the document bar to add a tag.
- Click a tag chip in the sidebar to filter documents by that tag.
- Clicking a tag link inside the editor navigates to matching documents.
- Tags are reindexed automatically on every save.

---

## Favourites

Click **Favourite** in the doc actions menu (or on a database) to pin the item to the **Favourites** section at the top of the sidebar. Favourites are stored per-user and work across spaces.

---

## Moving a Document

Use **Move** from the doc actions menu to move the document to a different category within the same space.

---

## Archiving & Restoring

Use **Archive** from the doc actions menu to archive a document. To restore it, click the archive icon in the topbar to open the archive browser, then click **Unarchive**.

---

## Deleting a Document

Use **Delete** from the doc actions menu. This action is permanent and cannot be undone.

---

## Real-time Presence

If another user is currently editing the same document, their avatar(s) appear in the document bar. Clicking **Edit** will show a warning with three options:

- **Notify Me** — receive a desktop notification when the document becomes free.
- **Cancel** — do nothing.
- **Edit Anyway** — proceed despite the conflict risk.
