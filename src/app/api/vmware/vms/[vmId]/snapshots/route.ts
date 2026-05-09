import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, listSnapshots, createSnapshot } from "@/lib/vmware";

type Params = { params: Promise<{ vmId: string }> };

/** GET /api/vmware/vms/{vmId}/snapshots — list VM snapshots */
export async function GET(_request: NextRequest, { params }: Params) {
  const { vmId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted) {
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });
  }

  try {
    const snapshots = await listSnapshots(config, vmId);
    return NextResponse.json({ snapshots });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

/** POST /api/vmware/vms/{vmId}/snapshots — create a live snapshot */
export async function POST(request: NextRequest, { params }: Params) {
  const { vmId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted) {
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as { name?: string; description?: string; includeMemory?: boolean };
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Snapshot name is required" }, { status: 400 });
  const description = (body.description ?? "").trim();
  const includeMemory = body.includeMemory === true;

  try {
    await createSnapshot(config, vmId, name, description, includeMemory);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
