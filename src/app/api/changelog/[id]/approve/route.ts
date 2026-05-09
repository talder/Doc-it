import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addApproval, allowedTransitions, readChangeLog, isTerminal } from "@/lib/changelog";

/** POST /api/changelog/:id/approve — record an approval or rejection */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const data = await readChangeLog();
  const entry = data.entries.find(e => e.id === id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (isTerminal(entry.status)) return NextResponse.json({ error: "Change is closed" }, { status: 409 });

  const body = await request.json();
  const { decision, comment, role } = body;
  if (decision !== "Approved" && decision !== "Rejected")
    return NextResponse.json({ error: "decision must be Approved or Rejected" }, { status: 400 });

  const updated = await addApproval(id, user.username, role || undefined, decision, comment || undefined);
  if (!updated) return NextResponse.json({ error: "Failed" }, { status: 500 });

  return NextResponse.json({ entry: updated, allowedTransitions: allowedTransitions(updated) });
}
