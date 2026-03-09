import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryAuditLogs } from "@/lib/audit";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch a large batch of document events (no date filter — all time)
    const result = await queryAuditLogs({ pageSize: 200 });

    // Count per actor — only document create/update events
    const counts: Record<string, number> = {};
    for (const entry of result.entries) {
      if (
        entry.event === "document.update" ||
        entry.event === "document.create"
      ) {
        counts[entry.actor] = (counts[entry.actor] || 0) + 1;
      }
    }

    const leaders = Object.entries(counts)
      .map(([actor, count]) => ({ actor, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return NextResponse.json({ leaders });
  } catch (error) {
    console.error("Leaderboard error:", error);
    return NextResponse.json(
      { error: "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
