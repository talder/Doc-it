import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readChangeLogSettings, saveChangeLogSettings } from "@/lib/changelog";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await readChangeLogSettings();
  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const retentionYears = Number(body.retentionYears);

  if (!Number.isInteger(retentionYears) || retentionYears < 1 || retentionYears > 99) {
    return NextResponse.json(
      { error: "retentionYears must be an integer between 1 and 99" },
      { status: 400 },
    );
  }

  await saveChangeLogSettings({ retentionYears });
  return NextResponse.json({ success: true });
}
