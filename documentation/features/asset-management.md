# Asset Management

doc-it includes an IT asset registry for tracking servers, workstations, network devices, and other infrastructure. Assets are organised in a user-defined container hierarchy (tree structure) and support custom field definitions.

---

## Containers

Containers are hierarchical groups used to organise assets (e.g., "Data Centre A → Rack 1", "Office → Floor 2"). Create, rename, reorder, and nest containers as needed.

A container must be empty (no assets or child containers) before it can be deleted.

---

## Assets

Each asset receives an auto-incrementing ID (e.g., `AST-0001`).

### Built-in Fields

| Field | Description |
|---|---|
| Name | Hostname or asset name |
| Container | Which container the asset belongs to |
| Status | `Active`, `Maintenance`, `Decommissioned`, or `Ordered` |
| Type | Free-text type (e.g., "Rack Server", "Laptop", "Switch") |
| IP Addresses | One or more IP addresses |
| OS | Operating system |
| Location | Physical location |
| Owner | Responsible person |
| Purchase Date | Date of acquisition |
| Warranty Expiry | Warranty end date |
| Notes | Free-text notes |

### Custom Fields

Admins can define additional fields that apply to all assets. Supported types:

| Type | UI control |
|---|---|
| `text` | Single-line text |
| `number` | Numeric input |
| `date` | Date picker |
| `boolean` | Toggle |
| `select` | Dropdown with predefined options |
| `url` | Clickable link |

---

## Creating an Asset

1. Open **Assets** from the sidebar or admin area.
2. Select or create a container.
3. Click **+ New Asset**.
4. Fill in the fields and click **Save**.

---

## Storage

Asset data is stored in the SQLite KV store under the key `assets.json`. The data includes containers, custom field definitions, and the assets array.
