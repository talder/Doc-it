# Document History

doc-it automatically creates a revision snapshot every time you click **Done** after editing a document (provided the content has changed). This provides a full, browsable history of every published edit.

---

## Viewing History

Click the **Rev N** chip in the document bar to open the History Modal.


The modal lists all revisions in reverse chronological order with:
- Revision number
- Author username
- Timestamp
- A diff view comparing the selected revision to the current content

---

## Restoring a Revision

In the History Modal, click **Restore** next to any revision. The document content is replaced with that revision's content and a new revision is created to record the restore event.

---

## Revision Storage

Revisions are stored in `data/spaces/<slug>/history/<docname>/` as numbered `.md` files accompanied by a metadata `.json` sidecar:

```
data/spaces/my-space/history/my-doc/
├── 1.md
├── 1.json   # { rev, author, timestamp }
├── 2.md
└── 2.json
```

---

## API

See [API — Documents](../api/documents.md) for the `/history` and `/history/:rev/restore` endpoints.
