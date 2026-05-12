# Infrastructure Management

The **Infrastructure Management** module is a unified hub for device provisioning, DNS and DHCP management, Active Directory operations, and audit logging. It is accessed from the main navigation via the **Infrastructure** link.

---

## Overview

The module is organized into five tabs, selectable from the tab bar at the top of the page. The active tab is reflected in the URL (`?tab=dns`, `?tab=dhcp`, etc.) so links can be shared.

| Tab | Purpose |
|---|---|
| **Provision** | 5-step wizard to register new devices (Netbox + DNS + DHCP + CMDB) |
| **DNS** | Browse, query, create, and delete DNS records across all zones |
| **DHCP** | Browse scopes, manage reservations, view leases and scope statistics |
| **Active Directory** | Search and manage AD users, groups, and computers (admin-only) |
| **Audit Log** | Filterable log of all infrastructure actions with CSV export |

---

## Provision Tab

A guided 5-step wizard for registering new network devices.

### Step 1 — Select Device Profile

Choose a pre-configured device profile (e.g. Printer, Workstation, Server). Profiles define defaults for VLAN, prefix, DNS zone, DHCP scope, manufacturer filter, and whether an asset tag is required.

Device profiles are managed in **Admin → Provisioning**.

### Step 2 — Device Details

Enter the device name, select vendor/manufacturer and device type from Netbox, choose the site, enter the MAC address, and optionally add an asset tag and comment.

### Step 3 — Network Configuration

Select VLAN, IP prefix, IP allocation method (auto or manual), DNS zone, and DHCP scope. Defaults from the selected profile are pre-filled. DNS zones and DHCP scopes are fetched live from the provisioning agents.

### Step 4 — Pre-flight Checks

Automated checks run before provisioning:
- Netbox name uniqueness
- Netbox MAC uniqueness
- Netbox IP availability
- Ping check (IP should not respond)
- DNS record existence check
- DHCP reservation check

### Step 5 — Execute

Creates resources in sequence: Netbox device → interface → IP assignment → primary IP → DHCP reservation → DNS A record (with automatic PTR) → optional CMDB CI. Each step shows live progress. On failure, completed steps are automatically rolled back.

### History

A slide-out history panel shows all past provisioning operations with status, IP, profile, and timestamp.

---

## DNS Tab

Full DNS zone browsing and record management via the provisioning agent.

### Features

- **Zone selector** — dropdown of all DNS zones fetched from the agent
- **Records table** — lists all records in the selected zone with columns: Name, Type, Data, TTL
- **Sorting** — click column headers to sort
- **Filtering** — text filter across name and data fields
- **Type filter** — filter by record type (A, AAAA, CNAME, MX, TXT, SRV, NS, SOA, PTR)
- **Zone statistics bar** — record count breakdown by type
- **Add record** — modal to create A, CNAME, TXT, MX, or SRV records
- **Delete record** — type-back confirmation dialog; SOA and NS records are protected
- **CSV export** — export the current filtered view

### Zone Allowlist

The `allowedDnsZones` configuration restricts which zones allow write operations (create/delete). If empty, all zones are writable. Read-only browsing is always permitted for all zones.

---

## DHCP Tab

DHCP scope browsing and reservation management via the provisioning agent.

### Features

- **Scope selector** — dropdown of all DHCP scopes
- **Three sub-tabs:**
  - **Reservations** — list, create, and delete DHCP reservations with MAC, IP, hostname, and description
  - **Active Leases** — browse current lease assignments with MAC, hostname, and lease expiry
  - **Scope Info** — utilization progress bar, scope options (routers, DNS servers, domain name), and exclusion ranges
- **CSV export** — export reservations or leases

---

## Active Directory Tab

Direct LDAP management of AD objects. Uses the existing `ldapts` library and the service account configured in **Admin → Active Directory**.

> **Admin-only** — this tab is only visible to admin users. Controlled by the `adManagementEnabled` and `adManagementAdminOnly` configuration flags.

> **Requires LDAPS** — all write operations (password reset, enable/disable, unlock, group membership changes, computer deletion) require an SSL connection to Active Directory.

### Users Sub-tab

- Search by username, display name, or email
- View: sAMAccountName, display name, email, enabled status, locked status, last logon
- Actions:
  - **Reset password** — generates a strong 16-character temporary password; forces change at next logon
  - **Enable / Disable** — toggle the account via the `userAccountControl` attribute
  - **Unlock** — clear the `lockoutTime` attribute for locked accounts

### Groups Sub-tab

- Search by group name
- View: group name, description, member count
- Click a group to see its members in a side panel with type labels (user / computer / group)

### Computers Sub-tab

- Search by computer name
- View: name, OS, last logon, enabled status, OU, stale indicator (90+ days since last logon)
- Actions:
  - **Enable / Disable** — toggle the computer account
  - **Delete** — available for stale computers only

---

## Audit Log Tab

All infrastructure actions (provisioning, DNS, DHCP, AD) are logged to a dedicated `provisioning_audit` SQLite table.

### Features

- **Filterable table** — filter by tab (provision/dns/dhcp/ad), user, date range, and free text
- **Columns** — timestamp, user, tab, action, target, status (success/failure), details
- **Auto-refresh** — refreshes every 30 seconds
- **CSV export** — export the filtered audit log

### Audited Events

| Event Type | Actions |
|---|---|
| `provisioning.dns.create` | DNS record created |
| `provisioning.dns.delete` | DNS record deleted |
| `provisioning.dhcp.create` | DHCP reservation created |
| `provisioning.dhcp.delete` | DHCP reservation deleted |
| `provisioning.ad.password` | AD password reset |
| `provisioning.ad.enable` | AD account enabled/disabled |
| `provisioning.ad.unlock` | AD account unlocked |
| `provisioning.ad.group` | AD group membership changed |

---

## Provisioning Agent

A standalone PowerShell service (`tools/provisioning-agent/docit-agent.ps1`) that runs on your Windows DNS and/or DHCP servers. It exposes a REST API that Doc-it calls to manage DNS records and DHCP reservations.

### Requirements

- Windows Server 2016 or later
- PowerShell 5.1+
- DNS Server role and/or DHCP Server role installed
- No external dependencies

### Installation

1. Copy the `tools/provisioning-agent/` folder to the server (e.g. `C:\DocitAgent\`)
2. Edit `config.json` — set `token` and `mode` (`"dns"`, `"dhcp"`, or `"both"`)
3. Run `install.ps1` as Administrator — registers a scheduled task and opens the firewall
4. Configure the endpoint URL and token in **Admin → Provisioning** in Doc-it

See `tools/provisioning-agent/README.md` for full installation instructions, API reference, and troubleshooting.

### Agent Configuration

```json
{
  "port": 8520,
  "token": "your-secret-token",
  "mode": "dns",
  "logDir": "",
  "logRetentionDays": 30
}
```

| Setting | Description |
|---|---|
| `port` | HTTP listen port (default `8520`) |
| `token` | Bearer token for authentication — must match Doc-it config |
| `mode` | `"dns"`, `"dhcp"`, or `"both"` |
| `logDir` | Log directory (default: `logs/` subfolder) |
| `logRetentionDays` | Days to retain agent logs (default 30) |

---

## Configuration

All provisioning settings are managed in **Admin → Provisioning**.

| Setting | Description |
|---|---|
| **Netbox URL** | Netbox instance URL |
| **Netbox API Token** | API token (stored encrypted) |
| **Netbox Site ID** | Default site for new devices |
| **DNS Endpoint** | URL of the provisioning agent on the DNS server |
| **DNS Token** | Bearer token for DNS agent authentication |
| **DNS Default Zone** | Default forward lookup zone |
| **DHCP Endpoint** | URL of the provisioning agent on the DHCP server |
| **DHCP Token** | Bearer token for DHCP agent authentication |
| **DHCP Default Scope** | Default DHCP scope ID |
| **Allowed Users** | Non-admin users allowed to access the module |
| **Allowed DNS Zones** | Zones where write operations are permitted (empty = all) |
| **AD Management Enabled** | Master toggle for the AD tab |
| **AD Management Admin Only** | Restrict AD tab to admins (default true) |

### Device Profiles

Profiles are configured in **Admin → Provisioning → Device Profiles**:

| Field | Description |
|---|---|
| Name | Display name (e.g. "Printer", "Workstation") |
| Icon | Emoji icon shown in the wizard |
| Netbox Role ID | Default device role in Netbox |
| Default VLAN | Pre-selected VLAN |
| Default Prefix | Pre-selected IP prefix |
| Default DNS Zone | Pre-filled DNS zone in the wizard |
| Default DHCP Scope | Pre-filled DHCP scope in the wizard |
| Manufacturer Filter | Limit vendor dropdown to specific manufacturers |
| Requires Asset Tag | Make asset tag mandatory |
| Auto Create CMDB | Automatically create a CMDB CI after provisioning |

---

## Access Control

- **Admins** always have full access to all tabs
- **Allowed Users** (configured in Admin → Provisioning) can access Provision, DNS, DHCP, and Audit tabs
- **AD tab** is restricted to admins by default (`adManagementAdminOnly: true`)
- All actions are logged in the infrastructure audit log
