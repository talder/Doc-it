# VMware Inventory

The **VMware Inventory** module connects doc-it to a vCenter Server and provides a live view of your virtual machine estate directly inside the platform.

---

## Overview

Navigate to the **VMware Inventory** page (accessible from the main navigation) to see all VMs fetched from your vCenter. The module uses both the **vCenter REST API** (v7+) and the **vSphere SOAP API** to collect richer data than the REST API alone provides.

### What is fetched

| Field | Source |
|---|---|
| VM name, power state, CPU count, memory | REST `/api/vcenter/vm` |
| Guest OS type, hardware version | REST `/api/vcenter/vm/{id}` |
| VMware Tools version & status | REST `/api/vcenter/vm/{id}/tools` |
| Guest full OS name | REST `/api/vcenter/vm/{id}/guest/identity` (Tools required) |
| Memory in use | REST `/api/vcenter/vm/{id}/guest/memory` (Tools required) |
| IP address | REST `/api/vcenter/vm/{id}/guest/networking/interfaces` (Tools required) |
| Host assignment | SOAP `RetrievePropertiesEx` |
| VM annotation / notes | SOAP `summary.config.annotation` |
| Hardware version | SOAP `config.version` |
| Snapshot count & tree | SOAP `snapshot` property |
| Host physical CPU core count | SOAP `hardware.cpuInfo.numCpuCores` |

---

## The Inventory Table

The main table shows all VMs with sortable columns:

| Column | Description |
|---|---|
| **Name** | VM display name. Snapshot badge (📷) appears if the VM has snapshots — click it to manage them directly. Alert icon (⚠) marks powered-off VMs as potential zombies. |
| **Host** | ESXi host name — click to filter the table to that host |
| **Status** | Power state badge: On (green) / Off (red) / Suspended (amber) |
| **OS** | Detected guest OS — click to filter to that OS |
| **IP** | First non-link-local IPv4 address (requires VMware Tools running) |
| **Tools** | VMware Tools version string |
| **Memory** | Assigned memory + in-use when Tools is running |
| **CPU** | vCPU count |
| **Storage** | Total provisioned disk space |

### Sorting

Click any column header to sort ascending; click again for descending.

### Filtering

Use the header bar controls to filter by:
- **Search** — free-text search across VM name, host, OS, IP, annotation, and VM ID
- **State** — All / On / Off / Suspended
- **Host** — filter to a specific ESXi host
- **OS** — filter to a specific guest OS category

Active filters can be saved as named **Saved Filters** (bookmark icon) and recalled later. Filters are stored in browser `localStorage`.

---

## Sidebar

### Summary

Shows total VM count plus counts for Powered On, Powered Off, Suspended, and VMs with snapshots.

### By Host

Lists all ESXi hosts with their VM count. For each host the vCPU:pCore ratio is shown with a colour indicator:

| Ratio | Colour | Meaning |
|---|---|---|
| < 2:1 | Green | Well within capacity |
| 2–4:1 | Amber | Moderate oversubscription |
| > 4:1 | Red | Heavy oversubscription — review capacity |

Click a host to filter the table to that host only.

### By OS

Lists all detected guest OS categories sorted by VM count (most common first). Click an OS to filter the table.

---

## Expanded VM Detail

Click any VM row to expand a detail panel showing all collected metadata fields and an **action bar** with power controls and snapshot management.

### Power Actions

| Button | Action |
|---|---|
| **Start** | Power on the VM |
| **Shutdown** | Graceful guest shutdown (requires VMware Tools) |
| **Force Off** | Hard power off (equivalent to pulling the plug) |
| **Reboot** | Graceful guest reboot (requires VMware Tools) |
| **Reset** | Hard reset |
| **Suspend** | Suspend to disk |

Graceful actions (Shutdown, Reboot) are greyed out when VMware Tools is not running. Power actions are sent via the vCenter REST API with automatic SOAP fallback if REST returns HTTP 400 or 405.

---

## Snapshot Management

Snapshots can be managed **without** expanding the VM detail row:

1. Click the amber **📷 N** badge in the Name column
2. The snapshot panel opens inline directly below that VM row
3. Each snapshot in the tree shows: name, power state at snapshot time, creation date

### Delete a snapshot

- **Delete** — removes the selected snapshot only
- **Delete +children** — removes the snapshot and all its descendants in the chain

> ⚠️ Snapshot deletion is irreversible. Older snapshots consume significant datastore space; regular cleanup is recommended.

The snapshot panel can also be opened from the action bar inside an expanded VM row via the **Snapshots** button.

---

## Inventory Cache

To avoid hammering vCenter on every page load, the inventory is cached in SQLite:

- Default TTL: **15 minutes**
- The cache age is shown in the header: `📦 Cached: <timestamp>` vs `Updated: <timestamp>`
- Click **Refresh** in the header bar to bypass the cache and fetch fresh data immediately
- Configurable in **Admin → VMware → Inventory Cache TTL (minutes)**

---

## Weekly Inventory Report

When enabled, doc-it emails an HTML inventory summary on a configurable schedule.

The report includes:
- Total VM count with powered-on / powered-off / suspended breakdown
- OS distribution table
- ESXi host distribution table
- VMs with snapshots (top 20 by snapshot count)
- Powered-off VMs list (first 30)

Configure in **Admin → VMware → Weekly Inventory Report**:

| Setting | Description |
|---|---|
| Enable | Turn the weekly report on or off |
| Day of week | Which day the report is sent (Sun–Sat) |
| Send time | Time of day (HH:MM) |
| Recipients | Email addresses to send the report to |

SMTP must be configured in **Admin → Settings → SMTP** for email delivery to work.

---

## Export

### CSV / XLS / PDF

Use the export buttons in the header bar to download the **currently filtered** VM list:

- **CSV** — comma-separated values, compatible with Excel and LibreOffice
- **XLS** — native Excel format
- **PDF** — browser print dialog targeting the table only

All exports include: name, host, status, IP, OS, OS full name, HW version, Tools version, snapshot count, memory, CPU, storage, and annotation.

### Export to Enhanced Table

Click **Save as Table** to create an Enhanced Table in any Space with the current VM list as rows. The table is created with pre-configured columns (VM Name, Host, Status, IP, OS, HW Version, Tools, Snapshots, Memory, CPU, Storage, Annotation, VM ID).

After creation you are redirected to the home page where the new table is automatically opened.

---

## Configuration

All VMware settings are managed in **Admin → VMware**.

| Setting | Description |
|---|---|
| **Enable** | Master on/off switch for the module |
| **vCenter URL** | Full URL including protocol, e.g. `https://vcenter.example.com` |
| **Username** | vCenter username, e.g. `administrator@vsphere.local` |
| **Password** | Stored AES-256-GCM encrypted at rest |
| **Ignore SSL errors** | Skip certificate verification for self-signed vCenter certificates |
| **Allowed Users** | Users (besides admins) who can access the VMware page |
| **Cache TTL** | How many minutes to cache the inventory (0 = no cache) |
| **Weekly Report** | Enable, schedule, and recipients for the HTML email report |

Use **Test Connection** to verify credentials before saving.

---

## Access Control

- **Admins** always have access
- Non-admin users must be explicitly added to the **Allowed Users** list in **Admin → VMware**
- Users not in the list see an "Access Denied" message on the VMware page

---

## Zombie VM Detection

Any VM in **Powered Off** state is flagged with an ⚠ icon in the Name column. These may be orphaned or unused VMs consuming datastore resources. Hover the icon to see the tooltip.

Use the **State → Off** filter to list all powered-off VMs at once.

---

## Technical Notes

### SOAP vs REST

The vCenter REST API has limitations — in particular, `filter.hosts` returns HTTP 400 on some vCenter versions. The module works around this by using SOAP `RetrievePropertiesEx` with `ContinueRetrievePropertiesEx` pagination to collect host assignment, annotation, hardware version, and snapshot data for all VMs in a single traversal — regardless of vCenter version constraints.

### Concurrency

VM detail enrichment (guest OS name, memory usage, IP address) is fetched in batches of 10 concurrent REST requests to avoid overwhelming vCenter.

### SOAP Pagination

The SOAP fetch uses 100-object pages by default. For environments with 100+ VMs the module automatically continues fetching until all objects are retrieved.
