import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateOnCallSolution, isOnCallAllowed } from "@/lib/oncall";

/** PATCH /api/oncall/[id] — update solution field only */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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
