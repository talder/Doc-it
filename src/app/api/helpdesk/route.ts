import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readTickets, readConfig, filterTickets, createTicket, updateTicket, deleteTicket,
  addWorkLog, linkTickets, mergeTickets, decideApproval, getTicket,
  VALID_STATUSES, VALID_PRIORITIES,
} from "@/lib/helpdesk";
import type { TicketPriority, TicketType, TicketLinkRelation, CreateTicketFields } from "@/lib/helpdesk";
import { addChangeLogEntry } from "@/lib/changelog";
import type { ChangeType, ChangeRisk } from "@/lib/changelog";

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
    ticketType: sp.get("ticketType") || undefined,
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
      const { subject, description, priority, impact, urgency, category, assignedGroup, assignedTo, assetId, affectedAssetIds, relatedChangeId, contractId, formId, customFields, tags, attachments, ticketType, catalogItemId } = body;
      if (!subject?.trim()) return NextResponse.json({ error: "Subject is required" }, { status: 400 });
      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      const fields: CreateTicketFields = {
        subject, description: description || "",
        ticketType: ticketType as TicketType,
        priority: priority as TicketPriority,
        impact, urgency,
        category, assignedGroup, assignedTo,
        requester: body.requester || user.username,
        requesterEmail: body.requesterEmail || user.email,
        requesterType: "agent",
        assetId, affectedAssetIds, relatedChangeId, contractId,
        formId, customFields, tags, attachments, catalogItemId,
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
      const ticket = await updateTicket(id, updates, user.username);
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

    case "addWorkLog": {
      const { ticketId, agent, startTime, durationMinutes, notes, billable } = body;
      if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });
      const entry = await addWorkLog(ticketId, { agent: agent || user.username, startTime: startTime || new Date().toISOString(), durationMinutes: Number(durationMinutes || 0), notes: notes || "", billable: !!billable });
      if (!entry) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ workLog: entry });
    }

    case "linkTickets": {
      const { sourceId, targetId, relation } = body;
      if (!sourceId || !targetId || !relation) return NextResponse.json({ error: "sourceId, targetId and relation required" }, { status: 400 });
      const ok = await linkTickets(sourceId, targetId, relation as TicketLinkRelation);
      if (!ok) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    case "mergeTickets": {
      const { sourceId, targetId } = body;
      if (!sourceId || !targetId) return NextResponse.json({ error: "sourceId and targetId required" }, { status: 400 });
      const ok = await mergeTickets(sourceId, targetId, user.username);
      if (!ok) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    case "decideApproval": {
      const { ticketId, decision, comment } = body;
      if (!ticketId || !decision) return NextResponse.json({ error: "ticketId and decision required" }, { status: 400 });
      const ticket = await decideApproval(ticketId, user.username, decision, comment);
      if (!ticket) return NextResponse.json({ error: "Approval not found or already decided" }, { status: 404 });
      return NextResponse.json({ ticket });
    }

    case "createChangeFromTicket": {
      const { ticketId, changeType, risk, category: changeCat } = body;
      if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });
      const ticket = await getTicket(ticketId);
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      const change = await addChangeLogEntry({
        changeType: (changeType as ChangeType) || "Normal",
        date: new Date().toISOString().slice(0, 10),
        author: user.username,
        system: ticket.category || "Helpdesk",
        affectedAssetIds: ticket.affectedAssetIds.length > 0 ? ticket.affectedAssetIds : (ticket.assetId ? [ticket.assetId] : undefined),
        category: changeCat || "Other",
        description: `Change from ticket ${ticket.id}: ${ticket.subject}\n\n${ticket.description}`,
        impact: ticket.priority === "Critical" || ticket.priority === "High" ? "High impact — escalated from helpdesk" : "Standard impact",
        risk: (risk as ChangeRisk) || (ticket.priority === "Critical" ? "High" : "Medium"),
      });
      // Link change back to ticket
      await updateTicket(ticketId, { relatedChangeId: change.id }, user.username);
      return NextResponse.json({ change, ticketId });
    }

    case "setRelatedChange": {
      const { ticketId, changeId } = body;
      if (!ticketId || !changeId) return NextResponse.json({ error: "ticketId and changeId required" }, { status: 400 });
      const ticket = await updateTicket(ticketId, { relatedChangeId: changeId }, user.username);
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
      return NextResponse.json({ ticket });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
