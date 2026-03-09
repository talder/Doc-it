import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, getUsers, writeUsers, createSession, getSessionCookieName } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifySecurityEvent } from "@/lib/incident";
import { decryptField } from "@/lib/crypto";
import { verifyMfaPending } from "@/app/api/auth/login/route";
import { createHash } from "crypto";
import * as OTPAuth from "otpauth";

const PENDING_COOKIE = "docit-2fa-pending";
const MAX_TOTP_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const blocked = checkRateLimit(request, "auth");
  if (blocked) return blocked;

  try {
    // Read and validate the pending-2FA cookie
    const cookieStore = request.cookies;
    const pendingRaw = cookieStore.get(PENDING_COOKIE)?.value;

    if (!pendingRaw) {
      return NextResponse.json({ error: "No pending 2FA session" }, { status: 401 });
    }

    const pending = verifyMfaPending(pendingRaw);
    if (!pending) {
      return NextResponse.json({ error: "Invalid 2FA session" }, { status: 401 });
    }

    const user = await getUserByUsername(pending.username);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return NextResponse.json({ error: "Invalid 2FA session" }, { status: 401 });
    }

    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: "Verification code required" }, { status: 400 });
    }

    const normalized = String(code).replace(/[\s\-]/g, "").toUpperCase();
    let verified = false;

    // Decrypt TOTP secret (backward-compatible: unencrypted secrets also work)
    const totpSecretPlain = await decryptField(user.totpSecret);

    if (/^\d{6}$/.test(normalized)) {
      // Standard 6-digit TOTP code
      const totp = new OTPAuth.TOTP({
        issuer: "Doc-it",
        label: user.username,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(totpSecretPlain),
      });
      const delta = totp.validate({ token: normalized, window: 1 });
      verified = delta !== null;
    } else if (/^[A-F0-9]{4}[A-F0-9]{4}$/.test(normalized) || /^[A-F0-9]{4}-[A-F0-9]{4}$/.test(String(code).trim().toUpperCase())) {
      // Backup code (XXXX-XXXX format after normalization)
      const codeForHash = normalized.slice(0, 4) + "-" + normalized.slice(4);
      const hashed = createHash("sha256").update(codeForHash).digest("hex");
      const codeIndex = (user.totpBackupCodes ?? []).indexOf(hashed);
      if (codeIndex !== -1) {
        verified = true;
        // Remove the used backup code (single-use)
        const users = await getUsers();
        const idx = users.findIndex((u) => u.username === user.username);
        if (idx !== -1) {
          users[idx].totpBackupCodes = (users[idx].totpBackupCodes ?? []).filter((_, i) => i !== codeIndex);
          await writeUsers(users);
        }
        auditLog(request, {
          event: "auth.mfa.backup_used",
          outcome: "success",
          actor: user.username,
          sessionType: "anonymous",
          details: { codesRemaining: (user.totpBackupCodes?.length ?? 1) - 1 },
        });
      }
    }

    if (!verified) {
      // Increment TOTP failure counter; lock account at threshold
      const allUsers = await getUsers();
      const uidx = allUsers.findIndex((u) => u.username === user.username);
      if (uidx !== -1) {
        const attempts = (allUsers[uidx].totpFailedAttempts ?? 0) + 1;
        allUsers[uidx].totpFailedAttempts = attempts;
        if (attempts >= MAX_TOTP_ATTEMPTS) {
          allUsers[uidx].isLocked = true;
          allUsers[uidx].lockedAt = new Date().toISOString();
          await writeUsers(allUsers);
          auditLog(request, { event: "auth.account.locked", outcome: "failure", actor: user.username, sessionType: "anonymous", details: { reason: "too many TOTP failures", attempts } });
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
          notifySecurityEvent({ kind: "account_locked", username: user.username, ip, details: `Locked after ${attempts} failed TOTP attempts` });
          return NextResponse.json({ error: "Account locked after too many failed MFA attempts. Contact an administrator." }, { status: 403 });
        }
        await writeUsers(allUsers);
      }
      auditLog(request, {
        event: "auth.login.failed",
        outcome: "failure",
        actor: user.username,
        sessionType: "anonymous",
        details: { reason: "invalid 2FA code" },
      });
      return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
    }

    // Reset TOTP failure counter on success
    {
      const allUsers = await getUsers();
      const uidx = allUsers.findIndex((u) => u.username === user.username);
      if (uidx !== -1 && (allUsers[uidx].totpFailedAttempts ?? 0) > 0) {
        allUsers[uidx].totpFailedAttempts = 0;
        await writeUsers(allUsers);
      }
    }

    // Issue real session
    const sessionId = await createSession(user.username);
    const response = NextResponse.json({
      success: true,
      username: user.username,
      mustChangePassword: user.mustChangePassword === true,
    });

    // Set session cookie (8-hour TTL, matches server-side expiresAt)
    response.cookies.set(getSessionCookieName(), sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    // Clear pending 2FA cookie
    response.cookies.set(PENDING_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    auditLog(request, {
      event: "auth.login",
      outcome: "success",
      actor: user.username,
      sessionType: "session",
      details: { mfa: "totp" },
    });

    return response;
  } catch (error) {
    console.error("TOTP verify error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
