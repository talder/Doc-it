import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthChannelConfig, setMirthChannelConfig } from "@/lib/mirth";
import { auditLog } from "@/lib/audit";

type Params = Promise<{ id: string; channelId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, channelId } = await params;
  const config = getMirthChannelConfig(id, channelId);
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
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
  auditLog(req, {
    event: "mirth.channel.config.set",
    outcome: "success",
    resource: channelId,
    resourceType: "mirth-channel",
    details: {
      serverId: id, serverName: server.name, channelId, channelName,
      inactivityEnabled: body.inactivityEnabled,
      inactivityThresholdMinutes: body.inactivityThresholdMinutes,
    },
  });
  return NextResponse.json({ config: getMirthChannelConfig(id, channelId) });
}
