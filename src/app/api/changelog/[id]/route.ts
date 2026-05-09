import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateChangeLogEntry, allowedTransitions, readChangeLog, isTerminal } from "@/lib/changelog";
import type { ChangeLifecycleStatus, UpdateChangeFields } from "@/lib/changelog";

/** GET /api/changelog/:id */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const data = await readChangeLog();
  const entry = data.entries.find(e => e.id === id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry, allowedTransitions: allowedTransitions(entry) });
}

/** PUT /api/changelog/:id — update mutable fields (status, pirNotes, backoutPlan, etc.) */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const data = await readChangeLog();
  const entry = data.entries.find(e => e.id === id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isTerminal(entry.status)) return NextResponse.json({ error: "Change is closed — no updates allowed" }, { status: 409 });

  const body = await request.json() as UpdateChangeFields;

  // Validate status transition if provided
  if (body.status) {
    const allowed = allowedTransitions(entry);
    if (!allowed.includes(body.status as ChangeLifecycleStatus))
      return NextResponse.json({ error: `Cannot transition from ${entry.status} to ${body.status}. Allowed: ${allowed.join(", ")}` }, { status: 400 });
  }

  const updated = await updateChangeLogEntry(id, body, user.username);
  if (!updated) return NextResponse.json({ error: "Update failed" }, { status: 500 });

  return NextResponse.json({ entry: updated, allowedTransitions: allowedTransitions(updated) });
}
