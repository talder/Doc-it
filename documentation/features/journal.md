# Journal

doc-it includes a built-in journal system for daily logs, meeting notes, and personal reflections. Journals come in two flavours: **User journals** (private, encrypted) and **Space journals** (shared within a space).

---

## User Journal (Private)

Each user has a personal journal accessible from the sidebar. Entries are **encrypted at rest** using AES-256-GCM field-level encryption — only the owning user can read them.

### Creating an Entry

1. Open **Journal** from the sidebar.
2. Click **+ New Entry**.
3. Fill in the fields:
   - **Date** — defaults to today.
   - **Title** — auto-generated from the date if left blank.
   - **Content** — Markdown body.
   - **Tags** — optional labels for filtering.
   - **Mood** — optional emoji.
4. Click **Save**.

### Filtering Entries

Use the filter bar to narrow entries by:
- Date range (from / to)
- Tag
- Pinned status
- Free-text search (searches title, content, and tags)

### Pinning

Click the pin icon on an entry to mark it as pinned. Pinned entries appear first in the list and can be filtered separately.

---

## Space Journal (Shared)

Each space can have a shared journal visible to all space members. Space journal entries are stored in **plaintext** (not encrypted) and are accessible to anyone with at least `reader` access to the space.

Space journals use the same entry format (date, title, content, tags, mood, pinned).

---

## Journal Templates

Both user and space journals support **templates** — reusable entry blueprints with pre-filled content and default tags. Templates can be scoped to `user` or `space`.

---

## Storage

- **User journals:** SQLite KV store under key `users/{username}/journal.json` (content fields encrypted).
- **Space journals:** SQLite KV store under key `spaces/{slug}/journal.json` (plaintext).
