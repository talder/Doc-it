import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { bulkUpdateTickets, VALID_STATUSES, VALID_PRIORITIES } from "@/lib/helpdesk";
import type { TicketPriority, TicketStatus } from "@/lib/helpdesk";

/** POST /api/helpdesk/bulk — bulk ticket operations */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action, ids } = body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 });
  }

  switch (action) {
    case "bulkUpdate": {
      const { status, priority, assignedTo, assignedGroup, category, tags } = body;
      if (status && !VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      if (priority && !VALID_PRIORITIES.includes(priority)) {
        return NextResponse.json({ error: "Invalid priority" }, { status: 400 });
      }
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status as TicketStatus;
      if (priority) updates.priority = priority as TicketPriority;
      if (assignedTo !== undefined) updates.assignedTo = assignedTo;
      if (assignedGroup !== undefined) updates.assignedGroup = assignedGroup;
      if (category !== undefined) updates.category = category;
      if (tags !== undefined) updates.tags = tags;
      const result = await bulkUpdateTickets(ids, updates, user.username);
      return NextResponse.json(result);
    }

    case "bulkAssign": {
      const { assignedTo, assignedGroup } = body;
      if (!assignedTo && !assignedGroup) {
        return NextResponse.json({ error: "assignedTo or assignedGroup required" }, { status: 400 });
      }
      const updates: Record<string, unknown> = {};
      if (assignedTo) updates.assignedTo = assignedTo;
      if (assignedGroup) updates.assignedGroup = assignedGroup;
      const result = await bulkUpdateTickets(ids, updates, user.username);
      return NextResponse.json(result);
    }

    case "bulkClose": {
      const result = await bulkUpdateTickets(ids, { status: "Closed" as TicketStatus }, user.username);
      return NextResponse.json(result);
    }

    default:
      return NextResponse.json({ error: `Unknown bulk action: ${action}` }, { status: 400 });
  }
}
