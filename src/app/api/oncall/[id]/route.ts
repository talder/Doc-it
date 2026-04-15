import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readOnCallData, updateOnCallSolution, deleteOnCallEntry, isOnCallAllowed } from "@/lib/oncall";

type Params = { params: Promise<{ id: string }> };

/** GET /api/oncall/[id] — read a single on-call entry */
export async function GET(
  _request: NextRequest,
  { params }: Params,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isOnCallAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const data = await readOnCallData();
  const entry = data.entries.find((e) => e.id === id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

/** PATCH /api/oncall/[id] — update solution field only */
export async function PATCH(
  request: NextRequest,
  { params }: Params,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isOnCallAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();

  // Only solution may be updated
  if (Object.keys(body).some((k) => k !== "solution")) {
    return NextResponse.json(
      { error: "Only the solution field may be updated after creation" },
      { status: 400 },
    );
  }

  const entry = await updateOnCallSolution(id, body.solution ?? "");
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ entry });
}

/** DELETE /api/oncall/[id] — delete an on-call entry (admin only) */
export async function DELETE(
  _request: NextRequest,
  { params }: Params,
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { id } = await params;
  const deleted = await deleteOnCallEntry(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
