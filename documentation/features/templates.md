# Templates

Templates are reusable document blueprints. They can define typed **fields** (text, date, number, select, etc.) that writers fill in when creating a new document from the template.

---

## Creating a Template

1. In the sidebar, click **Templates** section → **+ New Template**.
2. Enter a name. The template is created under a `Templates/` category.
3. The template opens in edit mode. Write the template body using regular Markdown.
4. Define fields using the special `[[field:type:label]]` syntax inside the template content (or use the field-definition area in the editor).

Templates are stored as `.mdt` files and are separate from regular `.md` documents.

---

## Using a Template

When creating a new document (**+ New Document**), the modal shows available templates. Selecting one opens the **Template Form Modal** where you fill in the field values. Submitting generates a new document pre-filled with your values substituted in.

---

## Exporting & Importing Templates

Templates can be shared between instances:

- **Export** — right-click a template in the sidebar → **Export** to download a `.mdt` file.
- **Import** — in the sidebar Templates section, click **Import Template** and upload a `.mdt` file.

---

## Field Types

| Type | UI control |
|---|---|
| `text` | Single-line text input |
| `textarea` | Multi-line text area |
| `number` | Numeric input |
| `date` | Date picker |
| `select` | Dropdown with predefined options |
| `checkbox` | Boolean toggle |

---

## Template Storage

Templates are stored alongside regular documents as `.mdt` files inside `docs/{space}/{category}/`. They follow the same revision-history mechanism as regular documents.
