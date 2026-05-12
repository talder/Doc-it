import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchAdUsers } from "@/lib/ad-management";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  if (!q) return NextResponse.json({ users: [] });

  try {
    const users = await searchAdUsers(q);
    return NextResponse.json({ users });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Search failed" }, { status: 500 });
  }
}
