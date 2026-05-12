import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAdUser, resetAdPassword, setAdAccountEnabled, unlockAdAccount } from "@/lib/ad-management";
import { writeInfraAudit } from "@/lib/provisioning";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sam: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { sam } = await params;
  try {
    const adUser = await getAdUser(sam);
    if (!adUser) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user: adUser });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sam: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { sam } = await params;
  const body = await request.json();
  const action = body.action as string;

  try {
    if (action === "resetPassword") {
      const password = await resetAdPassword(sam);
      writeInfraAudit({
        user: user.username, tab: "ad", action: "password-reset",
        target: sam, status: "success",
        auditEvent: "provisioning.ad.password.reset",
      });
      return NextResponse.json({ success: true, password });
    }
    if (action === "enable" || action === "disable") {
      await setAdAccountEnabled(sam, action === "enable");
      writeInfraAudit({
        user: user.username, tab: "ad", action: `account-${action}`,
        target: sam, status: "success",
        auditEvent: "provisioning.ad.account.toggle",
      });
      return NextResponse.json({ success: true });
    }
    if (action === "unlock") {
      await unlockAdAccount(sam);
      writeInfraAudit({
        user: user.username, tab: "ad", action: "account-unlock",
        target: sam, status: "success",
        auditEvent: "provisioning.ad.account.toggle",
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    writeInfraAudit({
      user: user.username, tab: "ad", action: action ?? "unknown",
      target: sam, status: "failure",
      details: { error: err instanceof Error ? err.message : "Failed" },
    });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
