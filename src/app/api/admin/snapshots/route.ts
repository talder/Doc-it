import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createSnapshot, listSnapshots, pruneSnapshots } from "@/lib/snapshot";
import { auditLog } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const snapshots = await listSnapshots();
  return NextResponse.json({ snapshots });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  let label = "manual";
  try {
    const body = await request.json();
    if (body.label) label = String(body.label);
  } catch { /* use default label */ }

  try {
    const entry = await createSnapshot(label);
    // Auto-prune old snapshots (keep 10)
    await pruneSnapshots(10);
    auditLog(request, { event: "snapshot.create", outcome: "success", actor: admin.username, details: { snapshotId: entry.id, label } });
    return NextResponse.json({ success: true, snapshot: entry });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Snapshot creation failed" }, { status: 500 });
  }
}
