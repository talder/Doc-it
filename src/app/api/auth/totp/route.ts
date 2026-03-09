import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, verifyPassword } from "@/lib/auth";
import { auditLog } from "@/lib/audit";

/** GET — return current TOTP status (enabled/disabled) for profile page */
export async function GET(_req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    totpEnabled: user.totpEnabled ?? false,
    backupCodesRemaining: user.totpBackupCodes?.length ?? 0,
  });
}

/** DELETE — disable TOTP after verifying current password */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.totpEnabled) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  const { password } = await request.json();
  if (!password) {
    return NextResponse.json({ error: "Password is required to disable MFA" }, { status: 400 });
  }

  const { match } = await verifyPassword(password, user.passwordHash);
  if (!match) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const users = await getUsers();
  const idx = users.findIndex((u) => u.username === user.username);
  if (idx !== -1) {
    delete users[idx].totpSecret;
    delete users[idx].totpBackupCodes;
    users[idx].totpEnabled = false;
    await writeUsers(users);
  }

  auditLog(request, {
    event: "auth.mfa.disabled",
    outcome: "success",
    actor: user.username,
    sessionType: "session",
  });

  return NextResponse.json({ success: true });
}
