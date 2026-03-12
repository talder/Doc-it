# Dashboard

The Dashboard is a Dashy-style home page that displays a grid of link cards, organised into collapsible sections. It is accessible to all logged-in users and is configurable by admins.

---

## Sections

Sections group related links visually. Each section has:

| Field | Description |
|---|---|
| **Name** | Section heading |
| **Icon** | Optional icon (emoji or icon name) |
| **Colour** | Optional accent colour for the section header |
| **Order** | Display order (drag-and-drop in admin UI) |
| **Collapsed** | Whether the section starts collapsed |

Admins can add, edit, reorder, and delete sections in **Admin → Dashboard**.

---

## Links

Each link card within a section has:

| Field | Description |
|---|---|
| **Title** | Card heading |
| **URL** | Destination URL |
| **Description** | Optional subtitle shown on the card |
| **Icon** | `favicon` (auto-fetched from the URL) or a custom icon |
| **Colour** | Optional card accent colour |
| **Open in new tab** | Whether the link opens in a new browser tab (default: on) |
| **Visible to groups** | Restrict the card to specific [User Groups](../admin/user-groups.md); leave empty to show to everyone |
| **Order** | Position within the section |

---

## Group Visibility

Individual link cards can be restricted to one or more user groups. When a user opens the dashboard, they only see cards for which they are a member of at least one of the card's assigned groups (or cards with no group restriction).

See [User Groups](../admin/user-groups.md) for how to create and manage groups.

---

## Default Starred Space

Users can star a default space in the topbar for quick access at login. The starred space is pinned next to the space selector and restored on each session.

---

## Storage

Dashboard data (sections and links) is stored in the SQLite KV store under the key `dashboard.json`.
