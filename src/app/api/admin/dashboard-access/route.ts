import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readDashboardAccess, writeDashboardAccess } from "@/lib/dashboard-access";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await readDashboardAccess();
  return NextResponse.json(config);
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const allowedUsers: string[] = Array.isArray(body.allowedUsers)
    ? body.allowedUsers.map((u: unknown) => String(u).trim()).filter(Boolean)
    : [];
  const allowedAdGroups: string[] = Array.isArray(body.allowedAdGroups)
    ? body.allowedAdGroups.map((g: unknown) => String(g).trim()).filter(Boolean)
    : [];

  await writeDashboardAccess({ allowedUsers, allowedAdGroups });
  return NextResponse.json({ ok: true });
}
