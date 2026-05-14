/**
 * Helpdesk Notification Template Engine.
 *
 * Renders notification templates with variable substitution.
 * Variables: {{ticket.id}}, {{ticket.subject}}, {{ticket.status}}, {{ticket.priority}},
 * {{ticket.requester}}, {{ticket.assignedTo}}, {{ticket.category}}, {{ticket.type}},
 * {{agent}}, {{approver}}, {{comment}}, {{sla.response}}, {{sla.resolution}}
 */

import { readConfig } from "./helpdesk";
import type { Ticket, HdNotificationEvent, HdNotificationTemplate } from "./helpdesk";

interface TemplateVars {
  ticket: Ticket;
  agent?: string;
  approver?: string;
  comment?: string;
  sla?: { response: string; resolution: string };
}

function substitute(template: string, vars: TemplateVars): string {
  const t = vars.ticket;
  return template
    .replace(/\{\{ticket\.id\}\}/g, t.id)
    .replace(/\{\{ticket\.subject\}\}/g, t.subject)
    .replace(/\{\{ticket\.status\}\}/g, t.status)
    .replace(/\{\{ticket\.priority\}\}/g, t.priority)
    .replace(/\{\{ticket\.requester\}\}/g, t.requester)
    .replace(/\{\{ticket\.assignedTo\}\}/g, t.assignedTo || "Unassigned")
    .replace(/\{\{ticket\.category\}\}/g, t.category || "")
    .replace(/\{\{ticket\.type\}\}/g, t.ticketType || "incident")
    .replace(/\{\{agent\}\}/g, vars.agent || "")
    .replace(/\{\{approver\}\}/g, vars.approver || "")
    .replace(/\{\{comment\}\}/g, vars.comment || "")
    .replace(/\{\{sla\.response\}\}/g, vars.sla?.response || "n/a")
    .replace(/\{\{sla\.resolution\}\}/g, vars.sla?.resolution || "n/a");
}

/**
 * Render a notification template for a given event.
 * Returns null if no template is configured or event is disabled.
 */
export async function renderNotificationTemplate(
  event: HdNotificationEvent,
  vars: TemplateVars,
): Promise<{ subject: string; htmlBody: string } | null> {
  const cfg = await readConfig();
  const templates = cfg.notificationTemplates || [];
  const tpl = templates.find((t) => t.event === event && t.enabled);
  if (!tpl) return null;

  return {
    subject: substitute(tpl.subject, vars),
    htmlBody: substitute(tpl.htmlBody, vars),
  };
}

/** Get all configured templates. */
export async function getNotificationTemplates(): Promise<HdNotificationTemplate[]> {
  const cfg = await readConfig();
  return cfg.notificationTemplates || [];
}
