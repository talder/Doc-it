# Enhanced Tables

Enhanced Tables provide structured, spreadsheet-style data storage within a space. Each enhanced table has a schema (columns) and rows. Data is rendered in four interchangeable views.


---

## Creating a Enhanced Table

1. In the sidebar, scroll to the **Enhanced Tables** section and click **+**.
2. Enter a title and optionally choose a template.
3. Click **Create**. The enhanced table opens in table view.

Enhanced Tables can also be created inline within a document using the `/enhanced table` slash command.

---

## Views

Switch between views using the view-type buttons in the enhanced table toolbar.

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
| `relation` | Link to a row in another enhanced table (see [Relations](#relations) below) |
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
- Click a column header to open the column menu: rename it, change its type, set its display column (relation fields), or delete it.

---

## Sorting by Column Header

Click any column header in Table view to sort rows by that column. Clicking cycles through three states:
1. Unsorted (default, insertion order)
2. Ascending
3. Descending

Row numbers always reflect insertion order regardless of the current sort.

---

## Relations

A `relation` column links each row to a row in another enhanced table within the same space.

- **Linking a enhanced table**: click the column header → **Link to enhanced table …** and select the target enhanced table.
- **Display column**: click the column header → **Display column …** to choose which field from the linked enhanced table is shown in the cell.
- **Picking a related row**: click a relation cell to open the **Relation Picker** — a searchable modal that lists all rows in the linked enhanced table; already-selected rows appear at the top.

---

## Filtering & Sorting

Use the **Filter** and **Sort** controls in the toolbar to narrow the visible rows or reorder them.

---

## Search

The enhanced table toolbar includes a **search** input that filters rows by any text column.

---

## Favouriting a Enhanced Table

Click the `…` menu on a enhanced table in the sidebar → **Favourite** to pin it in the Favourites section.

---

## Deleting a Enhanced Table

Click the `…` menu in the sidebar → **Delete**. This action is permanent.

---

## Tags

Enhanced tables support the same tagging system as documents.

- **Adding tags** — click the **+** button in the database view header to add a tag. The autocomplete suggests existing tags from the space.
- **Removing tags** — click the **×** on any tag chip to remove it.
- **Tag colours** — tag chips use the same colours configured in the Tag Manager.
- **Tag view** — enhanced tables with tags appear under their respective tags in the sidebar tag view, alongside documents.
- **Global tag index** — enhanced table tags are included in the space tag index. Tag rename and delete operations in the Tag Manager propagate to enhanced tables.

---

## Storage

Each enhanced table (schema + all rows) is stored as a single JSON file at `docs/{space}/.enhanced tables/{id}.db.json`.
