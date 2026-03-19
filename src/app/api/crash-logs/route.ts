import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { queryCrashLogs } from "@/lib/crash-log";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;

    const result = await queryCrashLogs({
      dateFrom: sp.get("dateFrom") ?? undefined,
      dateTo: sp.get("dateTo") ?? undefined,
      source: sp.get("source") ?? undefined,
      level: sp.get("level") ?? undefined,
      text: sp.get("text") ?? undefined,
      page: sp.get("page") ? Number(sp.get("page")) : undefined,
      pageSize: sp.get("pageSize") ? Number(sp.get("pageSize")) : undefined,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Crash log query error:", error);
    return NextResponse.json({ error: "Failed to query crash logs" }, { status: 500 });
  }
}
