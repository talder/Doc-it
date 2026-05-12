import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readProvisioningConfig } from "@/lib/provisioning";

/** GET /api/provisioning/check — returns { allowed: true } if user can access provisioning. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ allowed: false });

  if (user.isAdmin) return NextResponse.json({ allowed: true });

  const cfg = await readProvisioningConfig();
  const allowed = cfg.allowedUsers.length === 0 || cfg.allowedUsers.includes(user.username);
  return NextResponse.json({ allowed });
}
