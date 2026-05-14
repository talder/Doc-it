/**
 * Helpdesk integrations — Slack and Microsoft Teams webhook notifications.
 *
 * Posts ticket events to configured webhook URLs.
 * All calls are fire-and-forget to avoid blocking ticket operations.
 */

import { readConfig } from "./helpdesk";
import type { Ticket, HdNotificationEvent } from "./helpdesk";

// ── Slack ────────────────────────────────────────────────────────────

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  fields?: { type: string; text: string }[];
}

function buildSlackPayload(event: HdNotificationEvent, ticket: Ticket, extra?: string): { text: string; blocks: SlackBlock[] } {
  const eventLabels: Record<string, string> = {
    ticket_created: "🎫 New Ticket",
    ticket_assigned: "👤 Ticket Assigned",
    status_changed: "🔄 Status Changed",
    comment_added: "💬 Comment Added",
    sla_warning: "⚠️ SLA Warning",
    sla_breached: "🚨 SLA Breached",
    escalated: "📢 Escalated",
    approval_requested: "✋ Approval Requested",
    approval_decided: "✅ Approval Decided",
  };

  const title = eventLabels[event] || event;
  return {
    text: `${title}: ${ticket.id} — ${ticket.subject}`,
    blocks: [
      { type: "header", text: { type: "plain_text", text: `${title}: ${ticket.id}` } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Subject:* ${ticket.subject}` },
          { type: "mrkdwn", text: `*Priority:* ${ticket.priority}` },
          { type: "mrkdwn", text: `*Status:* ${ticket.status}` },
          { type: "mrkdwn", text: `*Assigned:* ${ticket.assignedTo || "Unassigned"}` },
          { type: "mrkdwn", text: `*Requester:* ${ticket.requester}` },
          ...(extra ? [{ type: "mrkdwn", text: extra }] : []),
        ],
      },
    ],
  };
}

export async function postSlackNotification(event: HdNotificationEvent, ticket: Ticket, extra?: string): Promise<void> {
  try {
    const cfg = await readConfig();
    const slack = cfg.slackConfig;
    if (!slack?.enabled || !slack.webhookUrl) return;
    if (!slack.events.includes(event)) return;

    const payload = buildSlackPayload(event, ticket, extra);
    if (slack.channel) (payload as Record<string, unknown>).channel = slack.channel;

    await fetch(slack.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[helpdesk-slack] Webhook error:", (err as Error).message);
  }
}

// ── Microsoft Teams ──────────────────────────────────────────────────

function buildTeamsPayload(event: HdNotificationEvent, ticket: Ticket, extra?: string) {
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: `${event}: ${ticket.id}`,
    themeColor: ticket.priority === "Critical" ? "DC2626" : ticket.priority === "High" ? "EA580C" : "3B82F6",
    sections: [{
      activityTitle: `**${event.replace(/_/g, " ").toUpperCase()}**: ${ticket.id} — ${ticket.subject}`,
      facts: [
        { name: "Priority", value: ticket.priority },
        { name: "Status", value: ticket.status },
        { name: "Assigned To", value: ticket.assignedTo || "Unassigned" },
        { name: "Requester", value: ticket.requester },
        ...(extra ? [{ name: "Details", value: extra }] : []),
      ],
      markdown: true,
    }],
  };
}

/**
 * Post a ticket event to a Microsoft Teams webhook URL.
 * Teams uses the same config slot but a different payload format;
 * callers can provide a direct Teams webhook URL.
 */
export async function postTeamsNotification(
  webhookUrl: string, event: HdNotificationEvent, ticket: Ticket, extra?: string,
): Promise<void> {
  try {
    const payload = buildTeamsPayload(event, ticket, extra);
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[helpdesk-teams] Webhook error:", (err as Error).message);
  }
}

// ── Unified dispatcher ───────────────────────────────────────────────

/**
 * Fire integration notifications for a ticket event.
 * Call this from ticket CRUD functions (fire-and-forget).
 */
export async function notifyIntegrations(event: HdNotificationEvent, ticket: Ticket, extra?: string): Promise<void> {
  await postSlackNotification(event, ticket, extra).catch(() => {});
}
