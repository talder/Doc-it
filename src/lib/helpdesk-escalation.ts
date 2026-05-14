/**
 * Helpdesk Escalation Engine — background checker.
 *
 * Runs periodically (from instrumentation-node.ts) to evaluate
 * SLA warning/breach thresholds against configured escalation rules.
 * Fires actions: reassign, notify, set priority, etc.
 */

import { readConfig, readTickets, updateTicket, getSlaStatus } from "./helpdesk";
import type { Ticket, EscalationRule, EscalationTrigger, TicketPriority } from "./helpdesk";
import { readNotifications, writeNotifications } from "./notifications";
import type { AppNotification } from "./notifications";
import { getUsers } from "./auth";
import { sendMail } from "./email";

/** Check if a ticket is approaching or has breached SLA thresholds. */
function getEscalationTriggers(ticket: Ticket): EscalationTrigger[] {
  const triggers: EscalationTrigger[] = [];
  const now = Date.now();

  if (ticket.slaResponseDue && ticket.slaResponseMet === undefined) {
    const due = new Date(ticket.slaResponseDue).getTime();
    const remaining = (due - now) / 60_000; // minutes remaining
    if (remaining <= 0) triggers.push("sla_response_breach");
    else if (remaining <= 30) triggers.push("sla_response_warning"); // within 30 min
  }

  if (ticket.slaResolutionDue && ticket.slaResolutionMet === undefined) {
    const status = ticket.status;
    if (status !== "Resolved" && status !== "Closed") {
      const due = new Date(ticket.slaResolutionDue).getTime();
      const remaining = (due - now) / 60_000;
      if (remaining <= 0) triggers.push("sla_resolution_breach");
      else if (remaining <= 60) triggers.push("sla_resolution_warning"); // within 60 min
    }
  }

  return triggers;
}

/** Check if a rule's warning threshold matches. */
function ruleMatchesTrigger(rule: EscalationRule, ticket: Ticket): boolean {
  const now = Date.now();

  const getDue = (): number | null => {
    if (rule.trigger.startsWith("sla_response")) {
      return ticket.slaResponseDue ? new Date(ticket.slaResponseDue).getTime() : null;
    }
    return ticket.slaResolutionDue ? new Date(ticket.slaResolutionDue).getTime() : null;
  };

  const due = getDue();
  if (due === null) return false;

  const minutesBefore = (due - now) / 60_000;
  const isBreach = rule.trigger.includes("breach");
  const isWarning = rule.trigger.includes("warning");

  if (isBreach && minutesBefore <= 0) return true;
  if (isWarning && minutesBefore > 0 && minutesBefore <= rule.warningMinutesBefore) return true;

  return false;
}

/** Track already-escalated tickets to avoid duplicate actions per check cycle. */
const escalatedCache = new Map<string, number>(); // key: `${ticketId}-${ruleId}`, value: timestamp

async function pushEscalationNotif(username: string, message: string, ticketId: string): Promise<void> {
  try {
    const notif: AppNotification = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: "helpdesk" as AppNotification["type"],
      message,
      from: "escalation-engine",
      spaceSlug: "",
      docName: ticketId,
      category: "helpdesk",
      createdAt: new Date().toISOString(),
      read: false,
      meta: { ticketId, escalation: "true" },
    };
    const existing = await readNotifications(username);
    existing.unshift(notif);
    if (existing.length > 100) existing.length = 100;
    await writeNotifications(username, existing);
  } catch { /* fire-and-forget */ }
}

export async function runEscalationCheck(): Promise<{ checked: number; escalated: number }> {
  const cfg = await readConfig();
  const rules = (cfg.escalationRules || []).filter((r) => r.enabled);
  if (rules.length === 0) return { checked: 0, escalated: 0 };

  const data = await readTickets();
  // Only check open/in-progress tickets
  const activeTickets = data.tickets.filter(
    (t) => !["Resolved", "Closed"].includes(t.status),
  );

  let escalated = 0;
  const now = Date.now();

  for (const ticket of activeTickets) {
    for (const rule of rules) {
      const cacheKey = `${ticket.id}-${rule.id}`;
      const lastRun = escalatedCache.get(cacheKey);
      // Don't re-escalate within 30 minutes
      if (lastRun && now - lastRun < 30 * 60_000) continue;

      if (!ruleMatchesTrigger(rule, ticket)) continue;

      // Execute escalation actions
      for (const action of rule.actions) {
        switch (action.type) {
          case "assign_group":
            await updateTicket(ticket.id, { assignedGroup: action.value }, "escalation-engine");
            break;
          case "assign_person":
            await updateTicket(ticket.id, { assignedTo: action.value }, "escalation-engine");
            break;
          case "set_priority":
            await updateTicket(ticket.id, { priority: action.value as TicketPriority }, "escalation-engine");
            break;
          case "send_notification": {
            // value = comma-separated usernames
            const users = action.value.split(",").map((u) => u.trim());
            const sla = getSlaStatus(ticket);
            const msg = `⚠️ Escalation: ${ticket.id} "${ticket.subject}" — ${rule.trigger.replace(/_/g, " ")} (response: ${sla.response}, resolution: ${sla.resolution})`;
            for (const u of users) {
              pushEscalationNotif(u, msg, ticket.id).catch(() => {});
            }
            // Also send email if we can resolve email addresses
            try {
              const allUsers = await getUsers();
              for (const u of users) {
                const user = allUsers.find((a) => a.username === u);
                if (user?.email) {
                  sendMail(user.email,
                    `[Helpdesk Escalation] ${ticket.id}: ${ticket.subject}`,
                    `<p>${msg}</p><p>Please review this ticket immediately.</p>`,
                  ).catch(() => {});
                }
              }
            } catch { /* ignore */ }
            break;
          }
        }
      }

      // Record escalation in ticket history
      if (!ticket.history) ticket.history = [];
      ticket.history.push({
        field: "escalation",
        oldValue: null,
        newValue: rule.name,
        changedBy: "escalation-engine",
        changedAt: new Date().toISOString(),
      });

      escalatedCache.set(cacheKey, now);
      escalated++;
    }
  }

  // Cleanup old cache entries (older than 2 hours)
  for (const [key, ts] of escalatedCache) {
    if (now - ts > 2 * 60 * 60_000) escalatedCache.delete(key);
  }

  return { checked: activeTickets.length, escalated };
}
