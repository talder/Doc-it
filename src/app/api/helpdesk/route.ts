import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readTickets, readConfig, filterTickets, createTicket, updateTicket, deleteTicket,
  VALID_STATUSES, VALID_PRIORITIES,
} from "@/lib/helpdesk";
import type { TicketPriority, CreateTicketFields } from "@/lib/helpdesk";

/** GET /api/helpdesk?q=&status=&priority=&assignedTo=&assignedGroup=&category=&requester= */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const data = await readTickets();
  const cfg = await readConfig();

  const tickets = filterTickets(data.tickets, {
    q: sp.get("q") || undefined,
    status: sp.get("status") || undefined,
    priority: sp.get("priority") || undefined,
    assignedTo: sp.get("assignedTo") || undefined,
    assignedGroup: sp.get("assignedGroup") || undefined,
    category: sp.get("category") || undefined,
    requester: sp.get("requester") || undefined,
    tag: sp.get("tag") || undefined,
  });

  return NextResponse.json({
    tickets: tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    groups: cfg.groups,
    categories: cfg.categories,
    fieldDefs: cfg.fieldDefs,
    forms: cfg.forms,
  });
}

/** POST /api/helpdesk — action-based mutations for tickets */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "createTicket": {
      const { subject, description, priority, category, assignedGroup, assignedTo, assetId, formId, customFields, tags, attachments } = body;
      if (!subject?.trim()) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      const fields: CreateTicketFields = {
        subject, description: description || "", priority: priority as TicketPriority,
        category, assignedGroup, assignedTo,
        requester: body.requester || user.username,
        requesterEmail: body.requesterEmail || user.email,
        requesterType: "agent",
        assetId, formId, customFields, tags, attachments,
      };
      const ticket = await createTicket(fields);
      return NextResponse.json({ ticket });
    }

    case "updateTicket": {
      const { id, ...updates } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      if (updates.status && !VALID_STATUSES.includes(updates.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (updates.priority && !VALID_PRIORITIES.includes(updates.priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      delete updates.action;
      const ticket = await updateTicket(id, updates);
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ ticket });
    }

    case "deleteTicket": {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      const ok = await deleteTicket(id);
      if (!ok) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
