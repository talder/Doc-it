import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/config";

/** DELETE /api/victorialogs/saved-queries/[id] — remove own or any query (admin) */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const db = getDb();

  const row = db.prepare("SELECT * FROM vl_saved_queries WHERE id = ?").get(id) as
    | { id: number; created_by: string }
    | undefined;

  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isAdmin = (user as { role?: string }).role === "admin";
  const username = (user as { username?: string; email?: string }).username ?? (user as { email?: string }).email ?? "";
  if (!isAdmin && row.created_by !== username) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  db.prepare("DELETE FROM vl_saved_queries WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
