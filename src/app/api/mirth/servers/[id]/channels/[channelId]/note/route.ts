import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthChannelNote, setMirthChannelNote } from "@/lib/mirth";

type Params = Promise<{ id: string; channelId: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, channelId } = await params;
  const note = getMirthChannelNote(id, channelId);
  return NextResponse.json({ note });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser(req);
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
  const { id, channelId } = await params;
  const body = await req.json().catch(() => ({}));
  const note = String(body.note ?? "").trim();
  const channelName = String(body.channelName ?? channelId);
  setMirthChannelNote(id, channelId, channelName, note, user.username);
  return NextResponse.json({ ok: true, note: getMirthChannelNote(id, channelId) });
}
