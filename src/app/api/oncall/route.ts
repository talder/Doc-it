import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readOnCallData,
  addOnCallEntry,
  filterOnCallEntries,
  parseWorkingTime,
  isOnCallAllowed,
} from "@/lib/oncall";

/** GET /api/oncall?from=&to=&q= */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isOnCallAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const data = await readOnCallData();
  const filtered = filterOnCallEntries(data.entries, {
    q: sp.get("q") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  });
  filtered.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  return NextResponse.json({ entries: filtered });
}

/** POST /api/oncall — create immutable on-call entry */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isOnCallAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { date, time, description, workingTime, solution } = body;

  if (!date || !time || !description?.trim()) {
    return NextResponse.json(
      { error: "date, time, and description are required" },
      { status: 400 },
    );
  }

  const workingMinutes = parseWorkingTime(workingTime ?? "");
  if (workingMinutes === null) {
    return NextResponse.json(
      { error: "workingTime must be a valid duration (e.g. 1h30m, 45m)" },
      { status: 400 },
    );
  }

  // Registrar is always forced to the current user
  const entry = await addOnCallEntry({
    registrar: user.username,
    date,
    time,
    description: description.trim(),
    workingMinutes,
    solution: solution ?? "",
  });

  return NextResponse.json({ entry }, { status: 201 });
}
