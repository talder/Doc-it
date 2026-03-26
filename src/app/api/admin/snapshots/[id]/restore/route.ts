import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { restoreSnapshot } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return null;
  return user;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const result = await restoreSnapshot(id);
  auditLog(request, {
    event: "snapshot.restore",
    outcome: result.success ? "success" : "failure",
    actor: admin.username,
    details: { snapshotId: id, error: result.error },
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Restore failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
