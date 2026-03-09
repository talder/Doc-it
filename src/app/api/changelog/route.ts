import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readChangeLog,
  addChangeLogEntry,
  filterChangeLog,
  getKnownSystems,
} from "@/lib/changelog";
import type { ChangeCategory, ChangeRisk, ChangeStatus } from "@/lib/changelog";

const VALID_CATEGORIES: ChangeCategory[] = ["Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other"];
const VALID_RISKS: ChangeRisk[] = ["Low", "Medium", "High", "Critical"];
const VALID_STATUSES: ChangeStatus[] = ["Completed", "Failed", "Rolled Back"];

/** GET /api/changelog?q=&from=&to=&category=&system=&systems=1 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  // Special endpoint: return known system names for autocomplete
  if (sp.get("systems") === "1") {
    const systems = await getKnownSystems();
    return NextResponse.json({ systems });
  }

  const data = await readChangeLog();
  const filtered = filterChangeLog(data.entries, {
    q: sp.get("q") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    category: sp.get("category") || undefined,
    system: sp.get("system") || undefined,
  });

  // Sort: newest first
  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ entries: filtered });
}

/** POST /api/changelog — create a new immutable change entry */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { date, system, category, description, impact, risk, status, linkedDoc } = body;

  // Validation
  if (!date || !system?.trim() || !description?.trim() || !impact?.trim()) {
    return NextResponse.json({ error: "date, system, description, and impact are required" }, { status: 400 });
  }
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400 });
  }
  if (!VALID_RISKS.includes(risk)) {
    return NextResponse.json({ error: `Invalid risk. Must be one of: ${VALID_RISKS.join(", ")}` }, { status: 400 });
  }
  if (!VALID_STATUSES.includes(status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const entry = await addChangeLogEntry({
    date,
    author: user.username,
    system: system.trim(),
    category,
    description: description.trim(),
    impact: impact.trim(),
    risk,
    status,
    linkedDoc: linkedDoc || undefined,
  });

  return NextResponse.json({ entry });
}
