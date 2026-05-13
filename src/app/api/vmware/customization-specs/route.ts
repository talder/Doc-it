import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isVmwareAllowed, readVmwareConfig, listCustomizationSpecs } from "@/lib/vmware";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isVmwareAllowed(user.username, user.isAdmin)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const config = await readVmwareConfig();
  if (!config.enabled || !config.vcenterUrl || !config.passwordEncrypted)
    return NextResponse.json({ error: "VMware not configured" }, { status: 503 });

  try {
    const specs = await listCustomizationSpecs(config);
    return NextResponse.json({ specs });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 502 });
  }
}
