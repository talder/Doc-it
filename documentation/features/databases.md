# Databases

Databases provide structured, spreadsheet-style data storage within a space. Each database has a schema (columns) and rows. Data is rendered in four interchangeable views.


---

## Creating a Database

1. In the sidebar, scroll to the **Databases** section and click **+**.
2. Enter a title and optionally choose a template.
3. Click **Create**. The database opens in table view.

Databases can also be created inline within a document using the `/database` slash command.

---

## Views

Switch between views using the view-type buttons in the database toolbar.

### Table View
A traditional spreadsheet grid. All rows and columns are visible. Click any cell to edit it inline.


### Kanban View
Rows are grouped into columns by a **select**-type field. Drag cards between columns to update the field value.


### Calendar View
Rows with a **date** field are placed on a monthly calendar. Navigate months with the arrow buttons.


### Gallery View
Rows are shown as cards with a prominent image or summary field.


---

## Column Types

| Type | Description |
|---|---|
| `text` | Free-form text |
| `number` | Numeric value |
| `select` | Single option from a predefined list |
| `multiselect` | Multiple options |
| `date` | Date / datetime picker |
| `checkbox` | Boolean |
| `url` | Clickable link |
| `email` | Email address |
| `relation` | Link to a row in another database |
| `formula` | Computed value |
| `attachment` | File upload |

---

## Adding & Editing Rows

- Click **+ Add row** at the bottom of the table to add a new row.
- Click any cell to edit it. Changes are saved automatically.
- Click the row expander icon to open a full row detail modal.

---

## Adding & Editing Columns

- Click **+ Add column** in the table header to add a column.
- Click a column header to rename it, change its type, or delete it.

---

## Filtering & Sorting

Use the **Filter** and **Sort** controls in the toolbar to narrow the visible rows or reorder them.

---

## Search

The database toolbar includes a **search** input that filters rows by any text column.

---

## Favouriting a Database

Click the `…` menu on a database in the sidebar → **Favourite** to pin it in the Favourites section.

---

## Deleting a Database

Click the `…` menu in the sidebar → **Delete**. This action is permanent.

---

## Storage

Each database (schema + all rows) is stored as a single JSON file at `docs/{space}/.databases/{id}.db.json`.
