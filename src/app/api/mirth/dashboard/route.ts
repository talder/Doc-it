import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthDashboard } from "@/lib/mirth";

/** GET /api/mirth/dashboard — fetches all enabled servers in parallel and returns aggregated health. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const dashboard = await getMirthDashboard();
    return NextResponse.json(dashboard);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Dashboard fetch failed" },
      { status: 500 },
    );
  }
}
