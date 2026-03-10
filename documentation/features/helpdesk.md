# Helpdesk & Ticketing

doc-it includes a built-in helpdesk system with ticket management, SLA enforcement, automation rules, custom forms, and a self-service portal for external users.

---

## Tickets

Each ticket tracks a request or issue through its lifecycle.

### Statuses

| Status | Description |
|---|---|
| `Open` | New ticket, not yet worked on |
| `In Progress` | Actively being handled |
| `Waiting` | Awaiting requester response or external action |
| `Resolved` | Solution provided |
| `Closed` | Ticket finalised |

### Priorities

| Priority |
|---|
| `Low` |
| `Medium` |
| `High` |
| `Critical` |

### Ticket Fields

Each ticket includes: subject, description, status, priority, category, assigned group, assigned person, requester, tags, attachments, comments (with internal/external visibility), and custom field values.

---

## Groups

Groups organise support agents. Each group has a name, description, and member list. Tickets can be assigned to a group or to an individual agent within a group.

---

## Categories

Helpdesk categories classify tickets by topic (e.g., "Hardware", "Access Request", "Bug Report"). Each category has a name, description, optional icon, and sort order.

---

## Custom Fields

Define additional fields beyond the standard ticket fields. Supported types: `text`, `number`, `date`, `boolean`, `select`, `multiselect`, `textarea`, `url`, `email`.

Custom fields can be marked as required and include placeholder text and default values.

---

## Forms (Form Designer)

Forms control which fields are shown when creating a ticket. The form designer lets you:
- Arrange standard fields (subject, description, priority, category, asset) and custom fields.
- Set per-field labels, required status, width (full/half), and help text.
- Create multiple forms and optionally filter them by category.
- Mark one form as the default.

---

## Automation Rules (Rule Engine)

Rules automate ticket routing and updates when a ticket is created. Each rule has:
- **Match type** — `all` (AND) or `any` (OR) conditions must match.
- **Conditions** — field comparisons (equals, contains, in, gt, lt, etc.).
- **Actions** — `assign_group`, `assign_person`, `set_priority`, `set_status`, `send_notification`, `add_tag`.
- **Stop on match** — optionally prevent further rules from firing.

Rules are evaluated in order. Reorder them by drag-and-drop.

---

## SLA Policies

SLA policies define response and resolution time targets per priority level.

| Setting | Description |
|---|---|
| Response time | Maximum time before first agent response |
| Resolution time | Maximum time before ticket is resolved |
| Business hours | Optionally restrict SLA calculation to business hours (start, end, working days) |

Multiple SLA policies can be defined. One is marked as the default.

---

## Portal (Self-Service)

The helpdesk portal provides a separate authentication system for external users (e.g., customers, employees without doc-it accounts).

### Portal Features
- **Registration & login** — email-based accounts with separate sessions.
- **Ticket submission** — portal users create tickets using the configured form.
- **My Tickets** — portal users view and comment on their own tickets.

### Portal Page Designer

Admins can design portal pages using a widget-based layout. Available widgets:

| Widget | Description |
|---|---|
| `hero` | Banner with title and description |
| `ticket_form` | Embedded ticket submission form |
| `my_tickets` | List of the portal user's tickets |
| `announcements` | Announcement cards |
| `faq` | Frequently asked questions |
| `categories` | Browsable category cards |
| `search` | Search bar |
| `custom_html` | Arbitrary HTML block |
| `quick_links` | Link cards |

Each widget has configurable width (`full`, `half`, `third`) and widget-specific settings. Pages can be published or unpublished, and one page can be designated as the home page.

---

## Storage

- **Configuration** (groups, categories, fields, forms, rules, SLA, portal pages): SQLite KV store under key `helpdesk.json`.
- **Tickets**: SQLite KV store under key `helpdesk-tickets.json` (separate for performance).
- **Portal users**: SQLite KV store under key `helpdesk-portal-users.json`.
- **Portal sessions**: SQLite KV store under key `helpdesk-portal-sessions.json`.
