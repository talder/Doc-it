# Helpdesk Phase 2 — Features & Configuration

This document covers all Phase 2 helpdesk enhancements: backend APIs, UI components, and configuration.

## 1. Priority Matrix (Impact × Urgency)

Tickets can have `impact` and `urgency` fields (both: low / medium / high / critical). When both are set and no explicit priority is given, the priority is auto-calculated from a configurable 4×4 matrix.

**Admin UI:** Helpdesk Admin → Integrations → Priority Matrix section. A grid of dropdowns lets you map each impact×urgency combination to a priority level. Click "Save Matrix" to persist.

**API:** `POST /api/helpdesk/admin` with `{ action: "updateSettings", priorityMatrix: [...entries] }` where each entry is `{ impact, urgency, priority }`.

**Ticket fields:** `impact?: ImpactLevel`, `urgency?: UrgencyLevel` on the Ticket type. Auto-calculation runs in `createTicket()` and `updateTicket()`.

## 2. SLA Business Hours & Pause/Resume

SLA timers now support business-hours calculation via `addBusinessMinutes()` in `helpdesk.ts`.

When a ticket enters **Waiting** or **Pending Approval** status, the SLA clock pauses (`slaPausedAt` is set). When leaving those statuses, paused time is accumulated in `slaPausedMinutes` and SLA due dates are extended accordingly.

**Detail Panel UI:** A yellow "SLA Paused" badge appears when `slaPausedAt` is set, showing accumulated paused minutes.

## 3. CSAT (Customer Satisfaction) Email

When enabled, an email survey is auto-sent to the requester when a ticket is resolved. The ticket records `csatSentAt`, and responses are stored as `csatRating` (1-5) and `csatComment`.

**Admin UI:** Helpdesk Admin → Integrations → CSAT section. Toggle "Auto-send CSAT survey email when ticket is resolved" and save.

**Config field:** `csatEmailEnabled: boolean` on HelpdeskConfig.

## 4. Bulk Operations

Select multiple tickets and apply status, priority, or assignee changes in one action.

**List UI:** Checkbox column on the ticket table. Select tickets → a bulk toolbar appears with dropdowns for status, priority, and assignee. Click "Apply" to update all selected tickets.

**API:** `POST /api/helpdesk/bulk` with `{ ids: string[], updates: { status?, priority?, assignedTo? } }`.

## 5. CSV Import / Export

**Export:** Click the download icon in the helpdesk header. Calls `GET /api/helpdesk/import-export?format=csv` and triggers a browser download.

**Import:** Click the upload icon → CSV Import modal. Upload a CSV file with at least a `subject` column. Optional columns: description, ticketType, priority, impact, urgency, category, assignedGroup, assignedTo, requester, requesterEmail, tags.

**API:** `POST /api/helpdesk/import-export` with `{ csv: "..." }` returns `{ imported: number, errors: string[] }`.

## 6. Saved Filters

Agents can save filter combinations (status, priority, assignee, category, search query) for quick access.

**Admin UI:** Helpdesk Admin → Saved Filters tab. CRUD for filters with name, shared flag, and filter criteria.

**List UI:** Saved filters appear in the sidebar below the filter section. Click to apply.

**API:** `createSavedFilter`, `updateSavedFilter`, `deleteSavedFilter` actions via `POST /api/helpdesk/admin`.

## 7. Ticket Templates

Pre-defined templates that pre-fill ticket fields (subject, body, priority, category, group, tags) when creating a new ticket.

**Admin UI:** Helpdesk Admin → Templates tab. Full CRUD with all template fields.

**Create Modal UI:** A "Apply Template" dropdown appears at the top of the create ticket modal when templates exist.

**API:** `createTicketTemplate`, `updateTicketTemplate`, `deleteTicketTemplate` actions.

## 8. Agent Availability / Status

Agents can set their status (online / offline / busy / away). Status is shown as a colored dot next to assignee names in the ticket list.

- 🟢 Green = online
- 🔴 Red = busy
- 🟡 Yellow = away
- ⚪ Gray = offline

**API:** `PUT /api/helpdesk/agents/status` with `{ status: "online" | "offline" | "busy" | "away" }`.

**Presence SSE:** `GET /api/helpdesk/presence` streams agent status changes in real-time.

## 9. Support Contracts

Track support agreements with organizations: date ranges, ticket limits, SLA overrides.

**Admin UI:** Helpdesk Admin → Contracts tab. CRUD with name, start/end dates, max tickets, notes, active toggle.

**API:** `createContract`, `updateContract`, `deleteContract` actions.

**Ticket field:** `contractId?: string` links a ticket to a contract. Shown in the detail panel.

## 10. Scheduled Reports

Automated email reports on helpdesk metrics sent daily, weekly, or monthly.

**Admin UI:** Helpdesk Admin → Reports tab. Configure name, schedule (daily/weekly/monthly), time, day of week/month, recipients.

**API:** `createScheduledReport`, `updateScheduledReport`, `deleteScheduledReport` actions.

**Runner:** Reports are executed by the scheduler in `instrumentation-node.ts`.

## 11. Slack Integration

Send ticket notifications to Slack via incoming webhooks. Supports Block Kit formatting.

**Admin UI:** Helpdesk Admin → Integrations → Slack section. Enable, set webhook URL, optional channel override, select events to notify on.

**Events:** ticket_created, ticket_assigned, status_changed, comment_added, sla_warning, sla_breached, escalated, approval_requested, approval_decided.

**Backend:** `helpdesk-integrations.ts` — `sendSlackNotification()` sends Block Kit payloads.

## 12. Microsoft Teams Integration

Similar to Slack but uses Teams MessageCard format via incoming webhook connector.

**Backend:** `helpdesk-integrations.ts` — `sendTeamsNotification()`.

**Config:** Shares the same integration config pattern. Teams webhook URL goes in the slackConfig webhookUrl field (the system auto-detects the format).

## 13. LDAP Portal Authentication

Portal users can authenticate against an LDAP directory instead of local accounts.

**Admin UI:** Helpdesk Admin → Integrations → LDAP section. Configure URL, bind DN, search base/filter, attribute mappings.

**Backend:** `helpdesk-ldap.ts` — uses `ldapjs` (optional dependency) for bind and search operations. Falls back gracefully if ldapjs is not installed.

**Config fields:** `ldapConfig: LdapConfig` with url, bindDn, bindPasswordEncrypted, searchBase, searchFilter, usernameAttr, emailAttr, fullNameAttr.

## 14. AI-Powered Article Suggestions

When creating a ticket, the system suggests relevant KB articles based on the subject text using TF-IDF similarity.

**Create Modal UI:** After typing 5+ characters in the subject, a debounced request fetches suggestions. Related articles appear as clickable links below the subject field.

**API:** `GET /api/helpdesk/predict?q=...&type=suggest` returns `{ articles: [{ title, slug, score }], suggestedCategory?: string }`.

**Backend:** `helpdesk-ai.ts` — `suggestArticles()` uses TF-IDF to rank KB documents.

## 15. AI-Powered Ticket Classification

Automatic category suggestion based on ticket subject content.

**Create Modal UI:** A "Suggested category" chip appears below the AI articles. Click to apply the suggestion.

**Backend:** `helpdesk-ai.ts` — `classifyTicket()` analyzes subject text against category patterns.

## 16. SLA Breach Prediction

ML-style prediction of SLA breach risk for open tickets, showing response and resolution breach probabilities.

**Detail Panel UI:** The `SlaPredictionPanel` component appears in the ticket detail view, showing risk levels (Low/Medium/High) with percentages and contributing factors.

**API:** `GET /api/helpdesk/predict?ticketId=...` returns `{ responseBreachRisk, resolutionBreachRisk, estimatedResolutionMinutes, factors }`.

**Backend:** `helpdesk-ai.ts` — `predictSlaBreach()` uses historical ticket data to estimate breach probability.

## 17. Impact Cascade (CMDB Integration)

For tickets linked to CMDB assets, run a BFS traversal to identify all affected downstream assets and optionally create cascade incident tickets.

**Detail Panel UI:** "Run Impact Cascade" button appears in the sidebar when a ticket has a linked asset.

**API:** `POST /api/helpdesk/impact` with `{ ticketId, assetId }`. Returns `{ affectedAssets: [...] }`.

**Backend:** `helpdesk-ai.ts` — BFS traversal of CMDB relationships. Also checks contract ticket limits.

## 18. Presence / Real-time Agent Status (SSE)

Server-Sent Events endpoint for real-time agent status updates.

**API:** `GET /api/helpdesk/presence` — SSE stream that emits `{ username, status, updatedAt }` events.

**List UI:** Agent status dots in the ticket table are populated from the admin config fetch. For real-time updates, the presence SSE endpoint can be consumed by future enhancements.

---

## Admin Tab Summary

The Helpdesk Admin page now has 12 tabs:

1. **Groups** — Support agent groups
2. **Categories** — Ticket categories
3. **Custom Fields** — Dynamic field definitions
4. **Forms** — Form designer
5. **Rules** — Automation rules
6. **SLA** — SLA policies
7. **Portal Pages** — Portal page designer
8. **Templates** — Ticket templates (Phase 2)
9. **Saved Filters** — Saved filter management (Phase 2)
10. **Contracts** — Support contracts (Phase 2)
11. **Reports** — Scheduled reports (Phase 2)
12. **Integrations** — Slack, LDAP, CSAT, Priority Matrix (Phase 2)

## Files Modified/Created

### Modified
- `src/app/helpdesk/admin/page.tsx` — 5 new admin tabs with inline editors
- `src/app/helpdesk/page.tsx` — Bulk ops, CSV export/import, saved filters sidebar, agent status dots, impact/urgency columns
- `src/components/helpdesk/TicketCreateModal.tsx` — Template selector, impact/urgency fields, AI suggestions
- `src/components/helpdesk/TicketDetailPanel.tsx` — Impact/urgency controls, SLA pause display, SLA prediction, impact cascade button, contract info

### Created
- `src/components/helpdesk/CsvImportModal.tsx` — CSV file upload and import UI
- `src/components/helpdesk/SlaPredictionPanel.tsx` — SLA breach risk prediction display
- `documentation/features/helpdesk-phase2.md` — This document
