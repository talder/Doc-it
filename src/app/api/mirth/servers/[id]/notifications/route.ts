import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMirthServerById, getMirthNotificationConfig, setMirthNotificationConfig } from "@/lib/mirth";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
  const { id } = await params;
  const config = getMirthNotificationConfig(id);
  return NextResponse.json({ config });
}

export async function PUT(req: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });
  const { id } = await params;

  const server = await getMirthServerById(id);
  if (!server) return NextResponse.json({ error: "Server not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  setMirthNotificationConfig(id, {
    recipients:  Array.isArray(body.recipients)
      ? (body.recipients as unknown[]).filter((r): r is string => typeof r === "string")
      : [],
    alertError:  body.alertError  !== false,
    alertStuck:  body.alertStuck  !== false,
    alertDown:   body.alertDown   !== false,
    alertPaused: body.alertPaused === true,
  });
  return NextResponse.json({ config: getMirthNotificationConfig(id) });
}
