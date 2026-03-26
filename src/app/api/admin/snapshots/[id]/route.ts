import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteSnapshot } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return null;
  return user;
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const ok = await deleteSnapshot(id);
  auditLog(request, {
    event: "snapshot.delete",
    outcome: ok ? "success" : "failure",
    actor: admin.username,
    details: { snapshotId: id },
  });

  if (!ok) {
    return NextResponse.json({ error: "Failed to delete snapshot" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
