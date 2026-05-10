import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthChannelNote, setMirthChannelNote, logMirthHistory } from "@/lib/mirth";
import { auditLog } from "@/lib/audit";

type Params = Promise<{ id: string; channelId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, channelId } = await params;
  const note = getMirthChannelNote(id, channelId);
  return NextResponse.json({ note });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
  const { id, channelId } = await params;
  const body = await req.json().catch(() => ({}));
  const note = String(body.note ?? "").trim();
  const channelName = String(body.channelName ?? channelId);
  setMirthChannelNote(id, channelId, channelName, note, user.username);
  auditLog(req, {
    event: "mirth.channel.note.set",
    outcome: "success",
    resource: channelId,
    resourceType: "mirth-channel",
    details: { serverId: id, channelId, channelName, note: note.slice(0, 200) },
  });
  logMirthHistory({
    serverId: id, serverName: "",
    channelId, channelName,
    eventType: "channel.note.set",
    actor: user.username,
    details: { note: note ? note.slice(0, 200) : "(cleared)" },
  });
  return NextResponse.json({ ok: true, note: getMirthChannelNote(id, channelId) });
}
