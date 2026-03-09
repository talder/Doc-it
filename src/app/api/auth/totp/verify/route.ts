import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, getUsers, writeUsers, createSession, getSessionCookieName } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { createHash } from "crypto";
import * as OTPAuth from "otpauth";

const PENDING_COOKIE = "docit-2fa-pending";

export async function POST(request: NextRequest) {
  try {
    // Read and validate the pending-2FA cookie
    const cookieStore = request.cookies;
    const pendingRaw = cookieStore.get(PENDING_COOKIE)?.value;

    if (!pendingRaw) {
      return NextResponse.json({ error: "No pending 2FA session" }, { status: 401 });
    }

    let pending: { username: string; expiresAt: string };
    try {
      pending = JSON.parse(Buffer.from(pendingRaw, "base64").toString("utf-8"));
    } catch {
      return NextResponse.json({ error: "Invalid 2FA session" }, { status: 401 });
    }

    if (!pending.username || !pending.expiresAt) {
      return NextResponse.json({ error: "Invalid 2FA session" }, { status: 401 });
    }

    if (new Date(pending.expiresAt) < new Date()) {
      return NextResponse.json({ error: "2FA session expired. Please log in again." }, { status: 401 });
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

    if (/^\d{6}$/.test(normalized)) {
      // Standard 6-digit TOTP code
      const totp = new OTPAuth.TOTP({
        issuer: "Doc-it",
        label: user.username,
        algorithm: "SHA1",
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(user.totpSecret),
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
      auditLog(request, {
        event: "auth.login.failed",
        outcome: "failure",
        actor: user.username,
        sessionType: "anonymous",
        details: { reason: "invalid 2FA code" },
      });
      return NextResponse.json({ error: "Invalid verification code" }, { status: 401 });
    }

    // Issue real session
    const sessionId = await createSession(user.username);
    const response = NextResponse.json({
      success: true,
      username: user.username,
      mustChangePassword: user.mustChangePassword === true,
    });

    // Set session cookie
    response.cookies.set(getSessionCookieName(), sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
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
