# Review Workflow

doc-it includes a lightweight document review workflow that allows writers to submit documents for review and track approval status.

---

## Status Values

| Status | Who can set it | Meaning |
|---|---|---|
| `draft` | Writers | Work in progress, not ready for review |
| `in-review` | Writers | Submitted for review; reviewer may be notified |
| `published` | Writers / Reviewers | Approved and considered live content |

---

## Submitting for Review

1. Open the document and click **Done** to exit edit mode (if editing).
2. The **Status Popover** opens automatically after finishing an edit.
3. Select **In Review** and optionally assign a reviewer from the space members list.
4. Click **Save**.


The reviewer's name appears in the status badge tooltip: `in-review · reviewer: alice`.

---

## Reviewing a Document

If you are assigned as a reviewer, the **Review Queue** in the topbar notification area shows pending items. Click an item to jump to the document.

As a reviewer (reader role with assignment), you can:
- Change the status to `published` (approve).
- Change the status back to `draft` (request changes).

---

## Review Queue in the Topbar

The topbar shows a count of documents in `in-review` status that are assigned to you across all accessible spaces. Clicking the bell/review icon opens the queue list. Clicking an item navigates directly to the document, switching spaces if needed.

---

## Status Map in the Sidebar

The sidebar shows status indicators (coloured dots) next to document names, giving a quick overview of the workflow state of the entire space.
