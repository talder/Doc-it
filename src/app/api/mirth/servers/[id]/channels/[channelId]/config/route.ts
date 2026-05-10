import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthChannelConfig, setMirthChannelConfig } from "@/lib/mirth";

type Params = Promise<{ id: string; channelId: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, channelId } = await params;
  const config = getMirthChannelConfig(id, channelId);
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
  const { id, channelId } = await params;

  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const channelName = String(body.channelName ?? channelId);
  setMirthChannelConfig(id, channelId, channelName, {
    inactivityThresholdMinutes: body.inactivityThresholdMinutes !== undefined ? Number(body.inactivityThresholdMinutes) : undefined,
    inactivityEnabled: body.inactivityEnabled !== undefined ? Boolean(body.inactivityEnabled) : undefined,
  });
  return NextResponse.json({ config: getMirthChannelConfig(id, channelId) });
}
