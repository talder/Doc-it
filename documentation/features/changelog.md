# Change Log — ITSM Change Management

The Change Log module provides full ITIL-aligned change management for your infrastructure.
Changes flow through a structured lifecycle, require approval from designated people,
and create an immutable audit trail.

---

## Change Types

Every change must be classified as one of three types:

| Type | Description | Approval flow | Auto-approve? |
|---|---|---|---|
| **Standard** | Pre-approved, recurring, low-risk (e.g. monthly patching, certificate renewal) | None — goes straight to Approved | ✅ Yes |
| **Normal** | Requires full review and CAB sign-off | Draft → Submitted → Under Review → CAB Approval → Approved | ❌ Manual |
| **Emergency** | Urgent unplanned change, bypasses CAB | Draft → Submitted → Approved | ❌ Manual, notifies all admins |

---

## Lifecycle

```
Standard:   Draft ─────────────────────────────► Approved ─► Implementing ─► Closed
Normal:     Draft ─► Submitted ─► Under Review ─► CAB Approval ─► Approved ─► Implementing ─► Closed
Emergency:  Draft ─► Submitted ─────────────────────────────── ► Approved ─► Implementing ─► Closed

Any status can also transition to: Rejected | Failed | Rolled Back
```

Entries are **mutable** until they reach a terminal status (Closed, Rejected, Completed).
Every field change is recorded in the entry's audit history.

---

## Fields Reference

### Core fields

| Field | Required | Description |
|---|---|---|
| Change Type | ✅ | Standard / Normal / Emergency |
| Date | ✅ | Date the change will occur or was logged (YYYY-MM-DD) |
| Time | | Exact time (HH:MM) — optional |
| System / Asset | ✅ | Hostname or asset name. Autocompletes from CMDB and previous entries |
| Category | ✅ | Disk, Network, Security, Software, Hardware, Configuration, Other (configurable) |
| Description | ✅ | What will be / was changed |
| Impact | ✅ | Expected business or service impact |
| Backout Plan | ✅ (Normal/Emergency) | Step-by-step rollback procedure if the change fails |
| Risk Level | ✅ | Low / Medium / High / Critical — select manually or use the questionnaire |
| Assigned To | | The doc-it user responsible for implementing this change |

### Planning fields

| Field | Description |
|---|---|
| Planned Start | Change window start (datetime) |
| Planned End | Change window end (datetime) |
| Est. Downtime (min) | Expected service downtime in minutes |
| Notify (CC emails) | Additional email addresses notified on status changes |

### Reference fields

| Field | Description |
|---|---|
| Rollback of | Reference to another CHG-# that this entry reverses |
| CMDB RFC | Linked CMDB change request (RFC-XXXX) |

---

## Creating a Change

1. Click **+ Log Change** in the top-right.
2. **Select a template** (optional) — pre-fills common fields for recurring changes.
3. Choose a **Change Type** (Standard / Normal / Emergency).
4. Fill in all required fields.
5. Optionally use the **Risk Questionnaire** — answer 6 yes/no questions and the risk level is calculated automatically.
6. Choose an **Assigned To** user from the dropdown (all active doc-it users are listed).
7. Click **Review & Submit** → review the summary → confirm.

### Risk Questionnaire

The questionnaire scores six factors to auto-calculate risk:

| Question | Weight |
|---|---|
| Does this affect a production system? | 2 |
| Will this cause service downtime? | 2 |
| Is rollback complex or time-consuming (>1h)? | 2 |
| Does this affect more than 10 users? | 1 |
| Does this involve firewall, auth, or security? | 2 |
| Has this exact change never been done before? | 1 |

**Score → Risk**: 0–2 = Low · 3–4 = Medium · 5–6 = High · 7+ = Critical

---

## Change Templates

Admins can create templates for frequently repeated changes (e.g. "Monthly Patch Cycle",
"SSL Certificate Renewal", "Firewall Rule Change"). Templates pre-fill the type, category,
risk level, description, impact, and backout plan.

To manage templates: open the **⚙ Settings** panel (visible to admins in the Change Log header).

---

## Assignee (Assigned To)

Each change can be assigned to a specific doc-it user.

- **Creating**: select from the Assigned To dropdown (lists all active, non-locked users).
- **Reassigning**: open a change's detail modal → click **reassign** next to the Assigned To field → pick a user → Save.
- **My changes filter**: use the **My changes** checkbox in the sidebar to filter to changes where you are the author or assignee.
- Assignments are tracked in the change's history log.

---

## Approvals

Anyone with access to the Change Log can approve or reject an open change:

1. Click a change row to open the detail modal.
2. In the **Approvals** panel, optionally add a comment.
3. Click **Approve** or **Reject**.

Each user's approval is recorded with timestamp. Multiple approvals are supported.
The entry's history log shows all approval decisions.

> **CAB members** are configured in Settings and are notified by email for Normal and Emergency changes.

---

## Post-Implementation Review (PIR)

Once a change reaches **Implementing** or **Closed** status, a PIR text area appears in the detail modal.

Record: Did the change succeed? Any unexpected issues? Lessons learned?

PIR notes are saved to the entry and shown in the detail view.

---

## Rollback

To log a rollback for a completed change:

1. Open the completed change's detail modal.
2. Click **Log Rollback** (shown for Completed or Closed entries).
3. A new change entry is pre-filled with the original system, category, and description.
4. Set the new status (typically Rolled Back) and confirm.

The new entry records a reference to the original CHG in **Rollback of**.

---

## Status Transitions

Allowed transitions are enforced server-side. The detail modal shows only the valid next statuses for the current state.
Attempting an invalid transition (e.g. jumping from Draft to Closed) is rejected by the API.

---

## Change Freeze Periods

Admins can configure date ranges during which **Standard** and **Normal** changes are blocked.
Emergency changes always bypass freeze periods.

To configure: open **⚙ Settings** → Add Freeze Period (From, To, Reason).

Active freeze periods are shown in the sidebar and on the FSC Calendar (red highlighting).

---

## Conflict Detection

When creating a change with a Planned Start/End window, the system checks whether another
active change targets the same system in an overlapping window. A warning is shown on the
confirmation screen. You can still proceed, but should review and coordinate.

---

## Views

### List (default)

Table showing all changes with columns: ID, Type, Date, System, Category, Description, Risk, Status, Assigned To.

**KPI bar**: shows visible count, this-month count, failed/rolled-back count, high/critical count.

**Sidebar filters**:
- Calendar (click a day to filter to that date)
- Date range (from/to)
- Change Type
- Category
- Risk
- Status
- By System (top 10 most-changed, click to filter)
- Freeze Periods (info display)
- Quick Filters: My changes checkbox
- Search

### FSC Calendar (Forward Schedule of Changes)

Monthly calendar view showing all changes positioned on their scheduled date or planned date.
Color-coded by type (green=Standard, blue=Normal, red=Emergency).
Freeze periods highlighted in red.
Click any entry to open its detail modal.

### Statistics

Dashboard with:
- KPI cards (total, open, high/critical, this month)
- **Success rate** bar (% of closed changes that didn't fail)
- Changes per week (last 8 weeks bar chart)
- By Change Type tiles
- By Risk tiles
- By Category horizontal bar chart
- Most Changed Systems bar chart
- By Status counts

---

## Notifications

| Trigger | Recipients |
|---|---|
| High or Critical risk change submitted | All admin users + CAB members |
| Emergency change submitted | All admin users |
| Status change | CC email list on the change |

Email notifications use the SMTP configuration in Admin → Email Settings.

---

## Export

Click **CSV** in the header to download all currently visible (filtered) entries.

**CSV columns**: ID, Type, Date, Time, Author, System, Category, Risk, Status, Description,
Impact, Backout Plan, Downtime (min), PIR Notes, Closed At.

---

## Audit Trail

Every field update, status transition, and approval decision is recorded in the entry's
immutable **History** section (visible in the detail modal). This includes:
- Who made the change
- What was changed (old → new value)
- When it happened

---

## Settings (Admin only)

Access via the **⚙** button in the Change Log header.

| Setting | Description |
|---|---|
| CAB Members | Comma-separated usernames. Notified for Normal/Emergency changes. |
| Change Freeze Periods | Date ranges where Standard/Normal changes are blocked. |
| Change Templates | Pre-defined forms for recurring change types. |

Category customisation is under Admin → Settings → Change Log.

---

## Integration with CMDB

- When a VMware inventory Refresh detects a disk, memory, or vCPU change, it automatically:
  - Creates a CHG entry (status: Completed, author: vmware-monitor)
  - Creates a linked CMDB change request (RFC-XXXX, status: pending)
- The **Rollback of** and **CMDB RFC** fields cross-link changes to CMDB records.
- The System field autocompletes from CMDB asset names.

---

## Ideas for Future Extension

The following features are candidates for future development:

1. **Email notification to assignee** when a change is assigned or reassigned to them
2. **Due date / SLA**: a target completion date that triggers an overdue warning
3. **Change dependencies**: link CHG-A as a prerequisite of CHG-B; CHG-B stays locked until CHG-A closes
4. **Recurring changes**: define a repeat schedule (weekly/monthly) and auto-generate Standard changes
5. **Two-person integrity**: require exactly 2 independent approvals for Critical changes
6. **Mobile quick-update**: scan a QR code on a server room wall to update change status from a phone
7. **Helpdesk integration**: link a helpdesk ticket to a change so the change auto-closes when the ticket resolves
8. **Webhook notifications**: POST to Slack/Teams/etc. when a change reaches a specific status
9. **Change impact matrix**: auto-suggest which CMDB assets are likely affected based on category + system
10. **Export to PDF**: generate a printable change request form with all fields and approval signatures
11. **Change blackout enforcement per-system**: not just global freezes, but "server X is frozen until Y"
12. **Risk score trends**: graph average risk level over time to spot if change quality is degrading
13. **Bulk status update**: move multiple changes from Approved → Implementing at the start of a maintenance window
14. **Change dashboard widget**: show "open changes assigned to me" on the doc-it home dashboard

