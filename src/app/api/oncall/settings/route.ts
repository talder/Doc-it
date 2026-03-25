import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readOnCallSettings, saveOnCallSettings } from "@/lib/oncall";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(await readOnCallSettings());
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();

  const settings = await readOnCallSettings();

  if (Array.isArray(body.allowedUsers)) {
    settings.allowedUsers = (body.allowedUsers as unknown[])
      .map((u) => String(u).trim())
      .filter(Boolean);
  }
  if (typeof body.emailEnabled === "boolean") settings.emailEnabled = body.emailEnabled;
  if (Array.isArray(body.emailRecipients)) {
    settings.emailRecipients = (body.emailRecipients as unknown[])
      .map((r) => String(r).trim())
      .filter(Boolean);
  }
  if (typeof body.emailSendTime === "string" && /^\d{2}:\d{2}$/.test(body.emailSendTime)) {
    settings.emailSendTime = body.emailSendTime;
  }

  await saveOnCallSettings(settings);
  return NextResponse.json({ success: true });
}
