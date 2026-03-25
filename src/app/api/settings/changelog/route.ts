import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readChangeLogSettings, saveChangeLogSettings, DEFAULT_CATEGORIES } from "@/lib/changelog";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await readChangeLogSettings();
  return NextResponse.json({
    ...settings,
    categories: settings.categories ?? DEFAULT_CATEGORIES,
  });
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

  const newSettings: Parameters<typeof saveChangeLogSettings>[0] = { retentionYears };

  if (Array.isArray(body.categories)) {
    const cats = (body.categories as unknown[]).map((c) => String(c).trim()).filter(Boolean);
    if (cats.length === 0) {
      return NextResponse.json({ error: "categories must have at least one entry" }, { status: 400 });
    }
    newSettings.categories = cats;
  }

  await saveChangeLogSettings(newSettings);
  return NextResponse.json({ success: true });
}
