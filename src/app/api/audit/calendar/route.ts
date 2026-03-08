import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getCalendarCounts } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user?.isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const year = sp.get("year") ? Number(sp.get("year")) : now.getFullYear();
    const month = sp.get("month") ? Number(sp.get("month")) : now.getMonth() + 1;

    if (year < 2020 || year > 2100 || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
    }

    const result = await getCalendarCounts(year, month);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Audit calendar error:", error);
    return NextResponse.json({ error: "Failed to load calendar data" }, { status: 500 });
  }
}
