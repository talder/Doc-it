import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, deleteSnapshot } from "@/lib/vmware";

type Params = { params: Promise<{ snapshotId: string }> };

/** DELETE /api/vmware/snapshots/{snapshotId}?children=true|false */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { snapshotId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted) {
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });
  }

  const removeChildren = request.nextUrl.searchParams.get("children") === "true";

  try {
    await deleteSnapshot(config, decodeURIComponent(snapshotId), removeChildren);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
