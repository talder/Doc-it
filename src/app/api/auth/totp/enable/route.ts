import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, getUsers, writeUsers, createSession, getSessionCookieName, invalidateUserSessions } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { encryptField } from "@/lib/crypto";
import { createHash, randomBytes } from "crypto";
import * as OTPAuth from "otpauth";

/** Generate 8 single-use backup codes in XXXX-XXXX format. */
function generateBackupCodes(): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = randomBytes(4).toString("hex").toUpperCase(); // e.g. "A3F2B1C9"
    const formatted = `${code.slice(0, 4)}-${code.slice(4)}`; // "A3F2-B1C9"
    plain.push(formatted);
    hashed.push(createHash("sha256").update(formatted).digest("hex"));
  }
  return { plain, hashed };
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (user.totpEnabled) {
    return NextResponse.json({ error: "MFA is already enabled" }, { status: 409 });
  }

  const { secret: secretBase32, code } = await request.json();
  if (!secretBase32 || !code) {
    return NextResponse.json({ error: "Secret and verification code required" }, { status: 400 });
  }

  // Validate the TOTP code against the provided secret
  const totp = new OTPAuth.TOTP({
    issuer: "Doc-it",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: code.replace(/\s/g, ""), window: 1 });
  if (delta === null) {
    return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
  }

  const { plain, hashed } = generateBackupCodes();

  const encryptedSecret = await encryptField(secretBase32);

  const users = await getUsers();
  const idx = users.findIndex((u) => u.username === user.username);
  if (idx !== -1) {
    users[idx].totpSecret = encryptedSecret;
    users[idx].totpEnabled = true;
    users[idx].totpBackupCodes = hashed;
    await writeUsers(users);
  }

  auditLog(request, {
    event: "auth.mfa.enabled",
    outcome: "success",
    actor: user.username,
    sessionType: "session",
  });

  // Invalidate all existing sessions and issue a fresh one
  await invalidateUserSessions(user.username);
  const newSessionId = await createSession(user.username);

  const resp = NextResponse.json({ success: true, backupCodes: plain });
  resp.cookies.set(getSessionCookieName(), newSessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return resp;
}
