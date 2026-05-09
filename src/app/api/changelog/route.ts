import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readChangeLog, addChangeLogEntry, filterChangeLog, getKnownSystems, getChangeCategories,
  detectConflicts, isInFreezePeriod, readChangeLogSettings,
} from "@/lib/changelog";
import type { ChangeRisk, ChangeType } from "@/lib/changelog";

const VALID_RISKS: ChangeRisk[] = ["Low", "Medium", "High", "Critical"];
const VALID_TYPES: ChangeType[] = ["Standard", "Normal", "Emergency"];

/** GET /api/changelog */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  if (sp.get("systems") === "1") return NextResponse.json({ systems: await getKnownSystems() });

  const [data, settings, systems] = await Promise.all([readChangeLog(), readChangeLogSettings(), getKnownSystems()]);

  const filtered = filterChangeLog(data.entries, {
    q: sp.get("q") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    category: sp.get("category") || undefined,
    system: sp.get("system") || undefined,
    risk: sp.get("risk") || undefined,
    status: sp.get("status") || undefined,
    changeType: sp.get("changeType") || undefined,
  });
  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    entries: filtered,
    systems,
    cabMembers: settings.cabMembers || [],
    freezePeriods: settings.freezePeriods || [],
    templates: settings.templates || [],
  });
}

/** POST /api/changelog — create a change entry */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const {
    changeType = "Normal", date, time, system, affectedAssetIds, category,
    description, impact, backoutPlan, risk, riskAnswers, status,
    plannedStart, plannedEnd, downtimeMinutes, ccEmails,
    relatedCrId, rollbackOf, linkedDoc,
  } = body;

  if (!date || !system?.trim() || !description?.trim() || !impact?.trim())
    return NextResponse.json({ error: "date, system, description and impact are required" }, { status: 400 });
  if (!VALID_TYPES.includes(changeType))
    return NextResponse.json({ error: `changeType must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400 });
  const validCats = await getChangeCategories();
  if (!validCats.includes(category))
    return NextResponse.json({ error: `Invalid category` }, { status: 400 });
  if (!VALID_RISKS.includes(risk))
    return NextResponse.json({ error: `Invalid risk` }, { status: 400 });

  // Freeze period check
  const freeze = await isInFreezePeriod(date, changeType);
  if (freeze)
    return NextResponse.json({ error: `Change freeze in effect: ${freeze.reason} (${freeze.from} – ${freeze.to})` }, { status: 409 });

  // Conflict detection (warn only — not blocking, returned as metadata)
  const conflicts = await detectConflicts(system?.trim(), plannedStart, plannedEnd);

  const entry = await addChangeLogEntry({
    changeType, date, ...(time ? { time } : {}),
    author: user.username,
    system: system.trim(),
    ...(affectedAssetIds?.length ? { affectedAssetIds } : {}),
    category, description: description.trim(), impact: impact.trim(),
    ...(backoutPlan?.trim() ? { backoutPlan: backoutPlan.trim() } : {}),
    risk,
    ...(riskAnswers ? { riskAnswers } : {}),
    ...(status ? { status } : {}),
    ...(plannedStart ? { plannedStart } : {}),
    ...(plannedEnd ? { plannedEnd } : {}),
    ...(downtimeMinutes ? { downtimeMinutes: Number(downtimeMinutes) } : {}),
    ...(ccEmails?.length ? { ccEmails } : {}),
    ...(relatedCrId?.trim() ? { relatedCrId: relatedCrId.trim() } : {}),
    ...(rollbackOf?.trim() ? { rollbackOf: rollbackOf.trim() } : {}),
    linkedDoc: linkedDoc || undefined,
  });

  return NextResponse.json({ entry, conflicts });
}
