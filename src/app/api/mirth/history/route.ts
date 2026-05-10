import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthHistory } from "@/lib/mirth";

/** GET /api/mirth/history — return Mirth activity history log. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "500"), 1000);
  const entries = getMirthHistory(limit);
  return NextResponse.json({ entries });
}
