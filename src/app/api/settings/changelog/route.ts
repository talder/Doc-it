import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readChangeLogSettings, saveChangeLogSettings, DEFAULT_CATEGORIES } from "@/lib/changelog";
import { randomUUID } from "crypto";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const settings = await readChangeLogSettings();
  return NextResponse.json({
    ...settings,
    categories: settings.categories ?? DEFAULT_CATEGORIES,
    cabMembers: settings.cabMembers ?? [],
    freezePeriods: settings.freezePeriods ?? [],
    templates: settings.templates ?? [],
  });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const updates: Parameters<typeof saveChangeLogSettings>[0] = { retentionYears: 5 };

  // retentionYears
  if (body.retentionYears !== undefined) {
    const r = Number(body.retentionYears);
    if (!Number.isInteger(r) || r < 1 || r > 99)
      return NextResponse.json({ error: "retentionYears must be 1-99" }, { status: 400 });
    updates.retentionYears = r;
  } else {
    const current = await readChangeLogSettings();
    updates.retentionYears = current.retentionYears;
  }

  // categories
  if (Array.isArray(body.categories)) {
    const cats = (body.categories as unknown[]).map(c => String(c).trim()).filter(Boolean);
    if (cats.length === 0) return NextResponse.json({ error: "categories must not be empty" }, { status: 400 });
    updates.categories = cats;
  }

  // cabMembers — array of usernames
  if (Array.isArray(body.cabMembers)) {
    updates.cabMembers = (body.cabMembers as unknown[]).map(c => String(c).trim()).filter(Boolean);
  }

  // freezePeriods
  if (Array.isArray(body.freezePeriods)) {
    updates.freezePeriods = (body.freezePeriods as { id?: string; from: string; to: string; reason: string }[])
      .filter(fp => fp.from && fp.to && fp.reason)
      .map(fp => ({ id: fp.id || randomUUID(), from: fp.from, to: fp.to, reason: fp.reason }));
  }

  // templates
  if (Array.isArray(body.templates)) {
    updates.templates = (body.templates as {
      id?: string; name: string; changeType: string; category: string; risk: string; description: string; impact: string; backoutPlan: string;
    }[]).filter(t => t.name && t.description)
      .map(t => ({
        id: t.id || randomUUID(),
        name: t.name,
        changeType: (["Standard","Normal","Emergency"].includes(t.changeType) ? t.changeType : "Normal") as "Standard"|"Normal"|"Emergency",
        category: t.category,
        risk: (["Low","Medium","High","Critical"].includes(t.risk) ? t.risk : "Medium") as "Low"|"Medium"|"High"|"Critical",
        description: t.description,
        impact: t.impact || "",
        backoutPlan: t.backoutPlan || "",
      }));
  }

  await saveChangeLogSettings(updates);
  return NextResponse.json({ success: true });
}
