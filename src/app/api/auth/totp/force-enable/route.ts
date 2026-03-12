/**
 * POST /api/auth/totp/force-enable
 *
 * Verifies the TOTP code, enables MFA, and issues a full session.
 * Called during forced MFA enrollment (user authenticated via password but
 * hadn't enrolled in MFA yet).  Authenticated by the signed
 * `docit-mfa-setup-pending` cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyMfaPending } from "@/app/api/auth/login/route";
import { getUserByUsername, getUsers, writeUsers, createSession, getSessionCookieName, useSecureCookies } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { encryptField } from "@/lib/crypto";
import { createHash, randomBytes } from "crypto";
import * as OTPAuth from "otpauth";

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

export async function POST(request: NextRequest) {
  const blocked = checkRateLimit(request, "auth");
  if (blocked) return blocked;

  const raw = request.cookies.get("docit-mfa-setup-pending")?.value;
  if (!raw) return NextResponse.json({ error: "No MFA setup session" }, { status: 401 });

  const pending = verifyMfaPending(raw);
  if (!pending) return NextResponse.json({ error: "Invalid or expired MFA setup session" }, { status: 401 });

  const user = await getUserByUsername(pending.username);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

  if (user.totpEnabled) {
    return NextResponse.json({ error: "MFA is already enabled" }, { status: 409 });
  }

  const { secret: secretBase32, code } = await request.json();
  if (!secretBase32 || !code) {
    return NextResponse.json({ error: "Secret and verification code required" }, { status: 400 });
  }

  // Verify the TOTP code
  const totp = new OTPAuth.TOTP({
    issuer: "Doc-it",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token: String(code).replace(/\s/g, ""), window: 1 });
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
    sessionType: "anonymous",
    details: { flow: "forced-enrollment" },
  });

  // Issue a full session now that MFA is set up
  const sessionId = await createSession(user.username);
  const response = NextResponse.json({
    success: true,
    username: user.username,
    mustChangePassword: user.mustChangePassword === true,
    backupCodes: plain,
  });

  response.cookies.set(getSessionCookieName(), sessionId, {
    httpOnly: true,
    secure: useSecureCookies(request),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  // Clear the MFA setup pending cookie
  response.cookies.set("docit-mfa-setup-pending", "", {
    httpOnly: true,
    secure: useSecureCookies(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
