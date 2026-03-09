import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers } from "@/lib/auth";
import { createHash, randomBytes } from "crypto";
import { auditLog } from "@/lib/audit";

function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
    plain.push(formatted);
    hashed.push(createHash("sha256").update(formatted).digest("hex"));
  }
  return { plain, hashed };
}

/** POST — regenerate backup codes (requires TOTP to be enabled) */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!user.totpEnabled) {
    return NextResponse.json({ error: "MFA is not enabled" }, { status: 400 });
  }

  const { plain, hashed } = generateBackupCodes();

  const users = await getUsers();
  const idx = users.findIndex((u) => u.username === user.username);
  if (idx !== -1) {
    users[idx].totpBackupCodes = hashed;
    await writeUsers(users);
  }

  auditLog(request, {
    event: "auth.mfa.enabled", // reuse — indicates backup codes were refreshed
    outcome: "success",
    actor: user.username,
    sessionType: "session",
    details: { action: "backup_codes_regenerated" },
  });

  return NextResponse.json({ backupCodes: plain });
}
