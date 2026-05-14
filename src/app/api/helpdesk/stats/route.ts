import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readTickets, readConfig, getSlaStatus } from "@/lib/helpdesk";
import type { Ticket } from "@/lib/helpdesk";

/** GET /api/helpdesk/stats?from=&to=&format=json|csv */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";
  const format = sp.get("format") || "json";

  const data = await readTickets();
  const cfg = await readConfig();

  // Date filter
  let tickets = data.tickets;
  if (from) tickets = tickets.filter((t) => t.createdAt >= from);
  if (to) tickets = tickets.filter((t) => t.createdAt <= to);

  // Status breakdown
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byGroup: Record<string, number> = {};
  const byAgent: Record<string, { assigned: number; resolved: number; totalWorkMinutes: number }> = {};

  let totalOpen = 0;
  let totalResolved = 0;
  let totalClosed = 0;
  let slaResponseMet = 0;
  let slaResponseBreached = 0;
  let slaResolutionMet = 0;
  let slaResolutionBreached = 0;
  let totalWorkMinutes = 0;
  let totalBillableMinutes = 0;

  for (const t of tickets) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
    byPriority[t.priority] = (byPriority[t.priority] || 0) + 1;
    byType[t.ticketType] = (byType[t.ticketType] || 0) + 1;

    if (t.assignedGroup) byGroup[t.assignedGroup] = (byGroup[t.assignedGroup] || 0) + 1;

    if (t.assignedTo) {
      if (!byAgent[t.assignedTo]) byAgent[t.assignedTo] = { assigned: 0, resolved: 0, totalWorkMinutes: 0 };
      byAgent[t.assignedTo].assigned++;
      if (t.status === "Resolved" || t.status === "Closed") byAgent[t.assignedTo].resolved++;
    }

    if (t.status === "Open" || t.status === "In Progress" || t.status === "Waiting" || t.status === "Pending Approval") totalOpen++;
    if (t.status === "Resolved") totalResolved++;
    if (t.status === "Closed") totalClosed++;

    // SLA metrics
    const sla = getSlaStatus(t);
    if (sla.response === "met") slaResponseMet++;
    if (sla.response === "breached") slaResponseBreached++;
    if (sla.resolution === "met") slaResolutionMet++;
    if (sla.resolution === "breached") slaResolutionBreached++;

    // Work log totals
    for (const wl of t.workLogs || []) {
      totalWorkMinutes += wl.durationMinutes;
      if (wl.billable) totalBillableMinutes += wl.durationMinutes;
      if (t.assignedTo && byAgent[t.assignedTo]) {
        byAgent[t.assignedTo].totalWorkMinutes += wl.durationMinutes;
      }
    }
  }

  // Resolve group names
  const groupNames: Record<string, string> = {};
  for (const g of cfg.groups) groupNames[g.id] = g.name;

  const byGroupNamed: Record<string, number> = {};
  for (const [gid, count] of Object.entries(byGroup)) {
    byGroupNamed[groupNames[gid] || gid] = count;
  }

  // Average resolution time (in hours)
  const resolvedTickets = tickets.filter((t) => t.resolvedAt);
  const avgResolutionHours = resolvedTickets.length > 0
    ? resolvedTickets.reduce((sum, t) => {
        const diff = new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime();
        return sum + diff / (1000 * 60 * 60);
      }, 0) / resolvedTickets.length
    : 0;

  const stats = {
    total: tickets.length,
    totalOpen,
    totalResolved,
    totalClosed,
    byStatus,
    byPriority,
    byType,
    byGroup: byGroupNamed,
    byAgent,
    sla: {
      responseMet: slaResponseMet,
      responseBreached: slaResponseBreached,
      resolutionMet: slaResolutionMet,
      resolutionBreached: slaResolutionBreached,
    },
    avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
    timeTracking: {
      totalWorkMinutes,
      totalBillableMinutes,
      totalWorkHours: Math.round(totalWorkMinutes / 6) / 10,
      totalBillableHours: Math.round(totalBillableMinutes / 6) / 10,
    },
    period: { from: from || "all", to: to || "all" },
  };

  if (format === "csv") {
    const rows = [
      ["Metric", "Value"],
      ["Total Tickets", String(stats.total)],
      ["Open", String(totalOpen)],
      ["Resolved", String(totalResolved)],
      ["Closed", String(totalClosed)],
      ["Avg Resolution (hours)", String(stats.avgResolutionHours)],
      ["SLA Response Met", String(slaResponseMet)],
      ["SLA Response Breached", String(slaResponseBreached)],
      ["SLA Resolution Met", String(slaResolutionMet)],
      ["SLA Resolution Breached", String(slaResolutionBreached)],
      ["Total Work Hours", String(stats.timeTracking.totalWorkHours)],
      ["Total Billable Hours", String(stats.timeTracking.totalBillableHours)],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=helpdesk-stats.csv" },
    });
  }

  return NextResponse.json(stats);
}
