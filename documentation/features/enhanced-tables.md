# Enhanced Tables

Enhanced Tables provide structured, spreadsheet-style data storage within a space. Each enhanced table has a schema (columns) and rows. Data is rendered in four interchangeable views.

---

## Creating an Enhanced Table

1. In the sidebar, scroll to the **Enhanced Tables** section and click **+**.
2. Enter a title and optionally choose a template (see [Templates](#templates)).
3. Click **Create**. The enhanced table opens in table view.

Enhanced Tables can also be created inline within a document using the `/enhanced table` slash command.

---

## Views

Switch between views using the view-type buttons in the enhanced table toolbar.

### Table View
A traditional spreadsheet grid. All rows and columns are visible. Click any cell to edit it inline. Tables with more than 100 rows use **virtual scrolling** — only visible rows plus a small buffer are rendered, keeping the UI responsive even with 5,000+ rows.

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
| `number` | Numeric value (supports formatting — see [Number Formatting](#number-formatting)) |
| `select` | Single option from a predefined list |
| `multiSelect` | Multiple options |
| `date` | Date picker |
| `checkbox` | Boolean |
| `url` | Clickable link |
| `email` | Email address |
| `member` | One or more space members |
| `createdBy` | Auto-populated with the row creator's username (read-only) |
| `relation` | Link to a row in another enhanced table (see [Relations](#relations)) |
| `lookup` | Pulls a value from a related table via a relation column (see [Lookups](#lookups)) |
| `tag` | Space tags — autocomplete from the tag index, inline creation with colour picker |
| `formula` | Computed value (see [Formulas](#formulas)) |
| `autoIncrement` | Auto-generated sequential ID with configurable prefix and padding (e.g. `CT-0001`) — read-only |

---

## Column Descriptions

Each column can have an optional **description**. When set, a small info icon appears on the column header and the full description is shown as a tooltip on hover.

To set or edit a description, open the column menu and select **Set description…**.

---

## Number Formatting

Number columns support configurable formatting via `Intl.NumberFormat`:

- **Plain** — raw number with optional decimal places
- **Currency** — formatted with a currency symbol (e.g. `€1,234.50`)
- **Percent** — displayed as a percentage (e.g. `75%`)

Configure via the column menu → **Number format…**. Formatted values are displayed in the grid, row edit modal, and query blocks.

---

## Auto-Increment Columns

Auto-increment columns generate a unique sequential ID for each new row. Configure:

- **Prefix** — a string prepended to the number (e.g. `TICKET-`, `INV-`)
- **Pad length** — zero-padding width (e.g. pad length 4 → `0001`, `0042`)

The counter is global per table and persists across row deletions.

---

## Adding & Editing Rows

- Click **+ New row** at the bottom of the table to add a new row.
- Click any cell to edit it. Changes are saved automatically.
- Click the row expander icon to open a full **Row Edit Modal** with all fields.
- **Undo / Redo**: press `Cmd+Z` (undo) or `Cmd+Shift+Z` (redo) to reverse or re-apply cell edits. The undo stack holds up to 100 entries and resets on navigation.

---

## Row Detail Page (Permalink)

Each row has a shareable permalink at:

```
/spaces/:slug/tables/:dbId/row/:rowId
```

Access the permalink by clicking **Copy Link** in the row edit modal. This link can be shared in documents, notifications, or external tools.

---

## Bulk Edit

Select multiple rows using the checkboxes, then use the selection toolbar to:

- **Bulk Edit** — set a column value across all selected rows
- **Duplicate** — copy selected rows
- **Clear values** — reset cells to empty
- **Delete** — remove selected rows

---

## Adding & Editing Columns

- Click **+ Add column** in the table header to add a column.
- Click a column header to open the column menu: rename, change type, set display column, configure number formatting, set a description, or delete.

---

## Relations

A `relation` column links each row to one or more rows in another enhanced table.

- **Linking a table**: open the column menu → **Link to enhanced table…** and select the target space, table, and display column.
- **Limit**: choose *one* (single link) or *many* (multi-link).
- **Bidirectional**: optionally create a reverse column on the target table that auto-updates.
- **Picking related rows**: click a relation cell to open a searchable dropdown of target rows.
- **Relation chips**: linked rows appear as clickable chips. Clicking navigates to the target table.

### Linked Table Preview

Hovering over a relation chip shows a **floating preview card** with the target row's first 5 fields. The preview is fetched lazily (300ms debounce) and cached for performance.

---

## Lookups

A `lookup` column pulls a value from a related table through a relation column. Configure:

- **Relation column** — which relation column to follow
- **Target column** — which field to pull from the linked row(s)
- **Aggregate** — how to combine multiple values: List, First, Count, Sum, Average, Min, Max

Lookup values are computed on the fly and displayed read-only.

---

## Formulas

Formula columns compute values using cell references and functions.

### Column References

Use `{ColumnName}` syntax to reference another column's value in the same row. For example: `{Price} * {Quantity}`.

### Functions

| Function | Description | Example |
|---|---|---|
| `SUM(col)` | Sum of a column across all rows | `SUM(Amount)` |
| `COUNT(col)` | Count of non-empty values | `COUNT(Email)` |
| `AVG(col)` | Average | `AVG(Score)` |
| `MIN(col)` / `MAX(col)` | Minimum / maximum | `MIN(Date)` |
| `IF(cond, then, else)` | Conditional | `IF({Status}="Done", "✓", "")` |
| `CONCAT(a, b, ...)` | String concatenation | `CONCAT({First}, " ", {Last})` |

### Footer Row (Aggregates)

Each view can display a **footer row** showing column aggregates (sum, average, count). Toggle it via the view settings. The footer respects the current filters.

---

## Filtering & Sorting

Use the **Filter** and **Sort** controls in the toolbar to narrow the visible rows or reorder them.

### Date Range Filter Presets

When filtering date columns, preset buttons are available for quick selection:

- **Today** / **This week** / **Last 7 days** / **Last 30 days** / **This month**
- **Between…** — opens two date pickers for a custom range

Presets translate to standard `gte`/`lte` filter operations and persist with the view.

### Sorting by Column Header

Click any column header in Table view to cycle through: Unsorted → Ascending → Descending. Row numbers always reflect insertion order.

---

## Conditional Formatting

Apply visual styles to rows based on cell values. Open **Format** in the toolbar to configure rules:

- Choose a column, operator, and value
- Set a background colour and optional bold styling
- Multiple rules are evaluated in order; all matching rules are applied

---

## Search

The enhanced table toolbar includes a **search** input that filters rows by any text column.

---

## CSV Import / Export

- **Export**: click **Export** in the toolbar to download the current view as a `.csv` file (respects column visibility and order).
- **Import**: click **Import** to upload a `.csv` file. Column headers are matched by name (case-insensitive). Unmatched columns are ignored.

---

## Query Blocks

Insert an enhanced table query block into any document using the `/query` slash command. The query block provides a visual builder to select a table, choose columns, set filters/sorts, and limit rows. The block renders a live, read-only table view of the query results.

Query blocks persist via a base64-encoded config attribute and survive markdown round-trips.

---

## Templates

When creating a new enhanced table, choose from built-in templates that include pre-configured columns **and sample data**:

| Template | Columns | Sample Rows |
|---|---|---|
| **Bug Tracker** | Title, Status, Priority, Assignee, Date | 5 sample bugs |
| **Meeting Notes** | Topic, Date, Attendees, Notes, Action Items | 3 sample meetings |
| **Project Tracker** | Task, Status, Owner, Due Date, Progress | 4 sample tasks |
| **Content Calendar** | Title, Platform, Publish Date, Status, Author | 3 sample posts |
| **Contact List** | Name, Email, Company, Phone, Role | 3 sample contacts |

A preview of the template's columns and sample rows is shown in the create modal before confirming.

---

## Revision History

Every change to an enhanced table is automatically saved as a **revision snapshot**. Up to 50 revisions are retained per table.

### Viewing History

Click the **History** button in the toolbar to open the revision history modal. Each revision shows:

- Timestamp
- Row count and column count at that point in time

### Restoring a Revision

Click **Restore** on any revision to revert the table to that state. The current state is saved as a new revision before restoring, so the restore is always reversible.

Revisions are stored in `history/{space}/.databases/{dbId}/` as timestamped JSON files.

> **Note**: Restore requires **admin** role on the space.

---

## Webhooks (Automations)

Enhanced tables support **webhook notifications** that fire an HTTP POST request when rows are created, updated, or deleted.

### Configuration

Click the **Automations** button in the toolbar to open the webhook configuration modal. For each webhook, configure:

- **URL** — the endpoint to receive the POST request
- **Events** — which events to listen for: `create`, `update`, `delete` (any combination)
- **Enabled** — toggle the webhook on/off without deleting it

### Payload

Each webhook POST includes a JSON body:

```json
{
  "event": "create",
  "tableId": "abc123",
  "tableTitle": "Project Tracker",
  "spaceSlug": "engineering",
  "row": {
    "id": "def456",
    "cells": { "col1": "Task title", "col2": "in-progress" }
  },
  "timestamp": "2026-04-15T10:00:00.000Z"
}
```

Webhooks are fire-and-forget with a 10-second timeout. Failures are silently ignored and do not affect the row operation.

> **Note**: Webhook configuration requires **admin** role on the space.

---

## Favouriting an Enhanced Table

Click the `…` menu on an enhanced table in the sidebar → **Favourite** to pin it in the Favourites section.

---

## Deleting an Enhanced Table

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

Each enhanced table (schema + all rows) is stored as a single JSON file at `docs/{space}/.databases/{id}.db.json`. Revision snapshots are stored at `history/{space}/.databases/{id}/{timestamp}.json`.
