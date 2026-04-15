import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readOnCallData, getHeatmapCounts, isOnCallAllowed, formatWorkingTime } from "@/lib/oncall";

/** GET /api/oncall/stats?days=90 — on-call statistics and heatmap */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isOnCallAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = parseInt(request.nextUrl.searchParams.get("days") || "90") || 90;
  const data = await readOnCallData();
  const heatmap = getHeatmapCounts(data.entries, days);

  // Summary statistics
  const totalEntries = data.entries.length;
  const totalMinutes = data.entries.reduce((s, e) => s + e.workingMinutes, 0);

  // Per-registrar breakdown
  const byRegistrar: Record<string, { count: number; totalMinutes: number }> = {};
  for (const e of data.entries) {
    if (!byRegistrar[e.registrar]) byRegistrar[e.registrar] = { count: 0, totalMinutes: 0 };
    byRegistrar[e.registrar].count++;
    byRegistrar[e.registrar].totalMinutes += e.workingMinutes;
  }

  // Top assisted-by users
  const assistCounts: Record<string, number> = {};
  for (const e of data.entries) {
    for (const u of e.assistedBy) {
      assistCounts[u] = (assistCounts[u] || 0) + 1;
    }
  }

  return NextResponse.json({
    totalEntries,
    totalWorkingTime: formatWorkingTime(totalMinutes),
    totalWorkingMinutes: totalMinutes,
    byRegistrar,
    topAssisted: Object.entries(assistCounts).sort((a, b) => b[1] - a[1]).slice(0, 10),
    heatmap,
  });
}
