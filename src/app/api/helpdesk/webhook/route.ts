import { NextRequest, NextResponse } from "next/server";
import { readConfig, createTicket } from "@/lib/helpdesk";
import type { TicketPriority, TicketType } from "@/lib/helpdesk";

/**
 * POST /api/helpdesk/webhook — inbound ticket creation via webhook.
 * Authenticated via X-Webhook-Secret header matching config.webhookSecret.
 *
 * Body: { subject, description, priority?, category?, requester, requesterEmail?, ticketType?, tags? }
 */
export async function POST(request: NextRequest) {
  const cfg = await readConfig();
  if (!cfg.webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const secret = request.headers.get("X-Webhook-Secret") || request.headers.get("x-webhook-secret");
  if (secret !== cfg.webhookSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { subject, description, priority, category, requester, requesterEmail, ticketType, tags } = body;

  if (!subject?.trim()) {
    return NextResponse.json({ error: "subject is required" }, { status: 400 });
  }
  if (!requester?.trim()) {
    return NextResponse.json({ error: "requester is required" }, { status: 400 });
  }

  const ticket = await createTicket({
    subject,
    description: description || "",
    priority: priority as TicketPriority,
    ticketType: ticketType as TicketType,
    category: category || "",
    requester,
    requesterEmail,
    requesterType: "portal",
    tags: tags || [],
  });

  return NextResponse.json({ ticket: { id: ticket.id, status: ticket.status, createdAt: ticket.createdAt } }, { status: 201 });
}
