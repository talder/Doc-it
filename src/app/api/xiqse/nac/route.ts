import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listNacGroups, lookupNacMac, addMacToNacGroup, removeMacFromNacGroup } from "@/lib/xiqse";

/** GET /api/xiqse/nac?action=groups|lookup&mac=XX:XX:XX:XX:XX:XX&serverId=optional */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action") ?? "groups";
  const serverId = searchParams.get("serverId") ?? undefined;

  if (action === "groups") {
    const groups = await listNacGroups(serverId);
    return NextResponse.json({ groups });
  }

  if (action === "lookup") {
    const mac = searchParams.get("mac");
    if (!mac) return NextResponse.json({ error: "mac query param required" }, { status: 400 });
    const info = await lookupNacMac(mac, serverId);
    return NextResponse.json({ endSystem: info });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

/** POST /api/xiqse/nac — push or remove a MAC from a NAC group. Admin only. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const mac = String(body.mac ?? "");
  const group = String(body.group ?? "");
  const serverId = body.serverId ? String(body.serverId) : undefined;

  if (!mac || !group) {
    return NextResponse.json({ error: "mac and group are required" }, { status: 400 });
  }

  if (action === "push") {
    const result = await addMacToNacGroup(mac, group, String(body.description ?? ""), serverId);
    return NextResponse.json(result);
  }
  if (action === "remove") {
    const result = await removeMacFromNacGroup(mac, group, serverId);
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "action must be 'push' or 'remove'" }, { status: 400 });
}
