import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { setAdComputerEnabled, deleteAdComputer } from "@/lib/ad-management";
import { writeInfraAudit } from "@/lib/provisioning";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ dn: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { dn } = await params;
  const body = await request.json();
  const action = body.action as string;
  const computerDn = decodeURIComponent(dn);

  try {
    if (action === "enable" || action === "disable") {
      await setAdComputerEnabled(computerDn, action === "enable");
      writeInfraAudit({
        user: user.username, tab: "ad", action: `computer-${action}`,
        target: computerDn, status: "success",
        auditEvent: "provisioning.ad.account.toggle",
      });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ dn: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { dn } = await params;
  const computerDn = decodeURIComponent(dn);

  try {
    await deleteAdComputer(computerDn);
    writeInfraAudit({
      user: user.username, tab: "ad", action: "computer-delete",
      target: computerDn, status: "success",
      auditEvent: "provisioning.ad.computer.delete",
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    writeInfraAudit({
      user: user.username, tab: "ad", action: "computer-delete",
      target: computerDn, status: "failure",
      details: { error: err instanceof Error ? err.message : "Failed" },
      auditEvent: "provisioning.ad.computer.delete",
    });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
