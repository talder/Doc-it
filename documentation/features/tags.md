# Tags

Tags allow you to organise and cross-reference documents without a rigid folder hierarchy.

---

## Tag Syntax

Tags use a `#parent/child` hierarchical format:

- `#engineering` — top-level tag
- `#engineering/backend` — child tag
- `#engineering/backend/api` — grandchild tag

All levels are separate tags and can be filtered independently.

---

## Adding Tags to a Document

Click the `+` button (tag adder) in the document bar. A dropdown appears with an autocomplete input.


- Start typing to filter existing tags.
- Press **Enter** or click a suggestion to add the tag.
- Press **Escape** to close without adding.

To remove a tag, click the `×` on a tag chip in the document bar.

---

## Filtering by Tag

Click a tag in the sidebar **Tags** section to filter the document list to only documents with that tag. Click again to clear the filter.

---

## Tag Storage

Tags are stored in each document's YAML **frontmatter** (the `tags` array). The sidebar tag index is built dynamically by scanning all documents in the space.

To manually rebuild the index (e.g., after a manual file change), click the **Reindex Tags** button in the sidebar Tags section.

---

## Tags in the Editor

When a document contains a `#tag` reference in its Markdown, it renders as a clickable chip. Clicking the chip:

- Navigates directly to the document if only one document uses that tag.
- Selects the tag filter in the sidebar if multiple documents use it.
