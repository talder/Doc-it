import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listVlHosts, addVlHost, removeVlHost } from "@/lib/audit";

/** GET /api/victorialogs/hosts — list configured hosts */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ hosts: listVlHosts() });
}

/** POST /api/victorialogs/hosts — add a host (admin only) */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { hostname, label } = body as { hostname?: string; label?: string };
  if (!hostname?.trim()) return NextResponse.json({ error: "hostname is required" }, { status: 400 });
  try {
    const host = addVlHost(hostname, label ?? "");
    return NextResponse.json({ host });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}

/** DELETE /api/victorialogs/hosts — remove a host by id (admin only) */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const { id } = body as { id?: number };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  removeVlHost(id);
  return NextResponse.json({ ok: true });
}
