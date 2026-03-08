import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryAuditLogs } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;

    const params = {
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      event: sp.get("event") ?? undefined,
      actor: sp.get("actor") ?? undefined,
      outcome: sp.get("outcome") ?? undefined,
      spaceSlug: sp.get("spaceSlug") ?? undefined,
      text: sp.get("text") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    };

    const exportFormat = sp.get("export");

    if (exportFormat === "csv" || exportFormat === "json") {
      // For exports, get all matching entries (no pagination)
      const result = await queryAuditLogs({ ...params, page: 1, pageSize: 10000 });

      if (exportFormat === "json") {
        const body = JSON.stringify(result.entries, null, 2);
        return new NextResponse(body, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="audit-export.json"`,
          },
        });
      }

      // CSV export
      const headers = [
        "timestamp", "eventId", "event", "outcome", "actor",
        "sessionType", "ip", "userAgent", "spaceSlug", "resource", "resourceType", "details",
      ];
      const rows = result.entries.map((e) => [
        e.timestamp,
        e.eventId,
        e.event,
        e.outcome,
        e.actor,
        e.sessionType,
        e.ip ?? "",
        e.userAgent ?? "",
        e.spaceSlug ?? "",
        e.resource ?? "",
        e.resourceType ?? "",
        e.details ? JSON.stringify(e.details) : "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

      const csv = [headers.join(","), ...rows].join("\n");
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-export.csv"`,
        },
      });
    }

    const result = await queryAuditLogs(params);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Audit query error:", error);
    return NextResponse.json({ error: "Failed to query audit logs" }, { status: 500 });
  }
}
