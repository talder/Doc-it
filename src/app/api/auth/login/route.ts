import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, getUsers, writeUsers, hashPassword, verifyPassword, createSession, getSessionCookieName } from "@/lib/auth";
import { auditLog } from "@/lib/audit";
import { checkRateLimit } from "@/lib/rate-limit";
import { notifySecurityEvent } from "@/lib/incident";
import { createHmac } from "crypto";
import {
  getAdConfig,
  authenticateAdUser,
  resolveAdAccess,
  upsertAdShadowUser,
  syncAdSpacePermissions,
} from "@/lib/ad";
import { notifyAdminsOfNewUser } from "@/lib/notifications";

// HMAC key for signing the MFA-setup-pending cookie — auto-generated per process
// (restarting the server invalidates pending cookies, which is acceptable)
const MFA_PENDING_KEY = process.env.MFA_PENDING_SECRET ?? require("crypto").randomBytes(32).toString("hex");

function signMfaPending(username: string, expiresAt: string): string {
  const payload = JSON.stringify({ username, expiresAt });
  const sig = createHmac("sha256", MFA_PENDING_KEY).update(payload).digest("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

export function verifyMfaPending(cookie: string): { username: string; expiresAt: string } | null {
  const dot = cookie.lastIndexOf(".");
  if (dot === -1) return null;
  const payloadB64 = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  let payload: string;
  try { payload = Buffer.from(payloadB64, "base64url").toString("utf-8"); } catch { return null; }
  const expected = createHmac("sha256", MFA_PENDING_KEY).update(payload).digest("base64url");
  if (expected !== sig) return null;
  try {
    const obj = JSON.parse(payload) as { username: string; expiresAt: string };
    if (!obj.username || !obj.expiresAt) return null;
    if (new Date(obj.expiresAt) < new Date()) return null;
    return obj;
  } catch { return null; }
}

const MAX_FAILED_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const blocked = checkRateLimit(request, "auth");
  if (blocked) return blocked;

  try {
    const { username, password, mode } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: "Username and password required" }, { status: 400 });
    }

    // -----------------------------------------------------------------------
    // AD authentication path
    // -----------------------------------------------------------------------
    const adConfig = await getAdConfig();
    const useAd = mode === "ad" || (mode !== "local" && adConfig.enabled);

    if (useAd && adConfig.enabled) {
      const adResult = await authenticateAdUser(adConfig, username, password);

      if (!adResult.success) {
        const isConnectionError = adResult.error?.startsWith("AD connection error");
        auditLog(request, {
          event: "auth.login.failed",
          outcome: "failure",
          actor: username,
          sessionType: "anonymous",
          details: { reason: adResult.error ?? "AD auth failed", mode: "ad" },
        });
        if (isConnectionError) {
          return NextResponse.json(
            { error: "Unable to reach the Active Directory server. Please try again later or contact an administrator." },
            { status: 502 }
          );
        }
        return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
      }

      const sam = adResult.sAMAccountName!;
      const access = resolveAdAccess(sam, adResult.memberOf ?? [], adConfig);

      if (!access.allowed) {
        await upsertAdShadowUser({
          sAMAccountName: sam,
          displayName: adResult.displayName ?? sam,
          email: adResult.email ?? "",
          isAdmin: false,
          status: "pending",
          adGroups: adResult.memberOf ?? [],
        });
        auditLog(request, {
          event: "auth.login.failed",
          outcome: "failure",
          actor: sam,
          sessionType: "anonymous",
          details: { reason: "not in allow-list", mode: "ad" },
        });
        return NextResponse.json(
          { error: "Your account is pending approval. Please contact an administrator." },
          { status: 403 }
        );
      }

      // Provision / update shadow user and sync space permissions
      const existingAdUser = await getUserByUsername(sam.toLowerCase());
      const shadowUser = await upsertAdShadowUser({
        sAMAccountName: sam,
        displayName: adResult.displayName ?? sam,
        email: adResult.email ?? "",
        isAdmin: access.isAdmin,
        status: "active",
        adGroups: adResult.memberOf ?? [],
      });
      await syncAdSpacePermissions(shadowUser.username, access.spaceRoles, access.isAdmin);

      // First-time AD login — notify admins
      if (!existingAdUser) {
        notifyAdminsOfNewUser(shadowUser.username, adResult.email ?? "", "ad").catch(() => {});
      }

      // Re-fetch user record so TOTP state is fresh
      const adUser = await getUserByUsername(shadowUser.username);
      if (!adUser) {
        return NextResponse.json({ error: "Account provisioning error" }, { status: 500 });
      }

      // TOTP: force enrollment if not yet set up
      if (!adUser.totpEnabled) {
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const pending = signMfaPending(adUser.username, expiresAt);
        const rSetup = NextResponse.json({ requiresMFASetup: true });
        rSetup.cookies.set("docit-mfa-setup-pending", pending, {
          httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
          sameSite: "lax", path: "/", maxAge: 10 * 60,
        });
        return rSetup;
      }

      // TOTP: request second factor
      if (adUser.totpEnabled) {
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        const pending = signMfaPending(adUser.username, expiresAt);
        const r2fa = NextResponse.json({ requires2FA: true });
        r2fa.cookies.set("docit-2fa-pending", pending, {
          httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
          sameSite: "lax", path: "/", maxAge: 5 * 60,
        });
        return r2fa;
      }

      const sessionId = await createSession(adUser.username);
      const response = NextResponse.json({ success: true, username: adUser.username });
      response.cookies.set(getSessionCookieName(), sessionId, {
        httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
        sameSite: "lax", path: "/", maxAge: 60 * 60 * 8,
      });
      auditLog(request, {
        event: "auth.login", outcome: "success",
        actor: adUser.username, sessionType: "session",
        details: { mode: "ad" },
      });
      return response;
    }

    // -----------------------------------------------------------------------
    // Local authentication path
    // -----------------------------------------------------------------------
    const user = await getUserByUsername(username);
    if (!user) {
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "user not found" } });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Redirect AD-sourced accounts back to AD login
    if (user.authSource === "ad") {
      return NextResponse.json(
        { error: "This account uses Active Directory authentication. Please use AD login." },
        { status: 403 }
      );
    }

    // Account lockout check
    if (user.isLocked) {
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "account locked" } });
      return NextResponse.json(
        { error: "Account is locked. Please contact an administrator." },
        { status: 403 }
      );
    }

    const { match, needsRehash } = await verifyPassword(password, user.passwordHash);

    if (!match) {
      const users = await getUsers();
      const idx = users.findIndex((u) => u.username === username);
      if (idx !== -1) {
        const attempts = (users[idx].failedLoginAttempts ?? 0) + 1;
        users[idx].failedLoginAttempts = attempts;
        if (attempts >= MAX_FAILED_ATTEMPTS) {
          users[idx].isLocked = true;
          users[idx].lockedAt = new Date().toISOString();
          await writeUsers(users);
          auditLog(request, { event: "auth.account.locked", outcome: "failure", actor: username, sessionType: "anonymous", details: { attempts } });
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
          notifySecurityEvent({ kind: "account_locked", username, ip, details: `Locked after ${attempts} failed password attempts` });
          return NextResponse.json(
            { error: "Account locked after too many failed attempts. Please contact an administrator." },
            { status: 403 }
          );
        }
        await writeUsers(users);
        if (attempts >= 3) {
          const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || undefined;
          notifySecurityEvent({ kind: "repeated_login_failures", username, ip, details: `${attempts} consecutive failed login attempts` });
        }
      }
      auditLog(request, { event: "auth.login.failed", outcome: "failure", actor: username, sessionType: "anonymous", details: { reason: "wrong password", attempts: (user.failedLoginAttempts ?? 0) + 1 } });
      const remaining = MAX_FAILED_ATTEMPTS - ((user.failedLoginAttempts ?? 0) + 1);
      return NextResponse.json(
        { error: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining before lockout.` },
        { status: 401 }
      );
    }

    // Successful password — reset failure counter and optionally rehash
    const users = await getUsers();
    const idx = users.findIndex((u) => u.username === username);
    if (idx !== -1) {
      let dirty = false;
      if (users[idx].failedLoginAttempts) { users[idx].failedLoginAttempts = 0; dirty = true; }
      if (needsRehash) { users[idx].passwordHash = await hashPassword(password); dirty = true; }
      if (dirty) await writeUsers(users);
    }

    // If TOTP is not yet enabled — force MFA enrollment before issuing a session
    if (!user.totpEnabled) {
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const pending = signMfaPending(username, expiresAt);
      const rSetup = NextResponse.json({ requiresMFASetup: true });
      rSetup.cookies.set("docit-mfa-setup-pending", pending, {
        httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
        sameSite: "lax", path: "/", maxAge: 10 * 60,
      });
      return rSetup;
    }

    // TOTP is enabled — request the second factor
    if (user.totpEnabled) {
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      const pending = signMfaPending(username, expiresAt);
      const r2fa = NextResponse.json({ requires2FA: true });
      r2fa.cookies.set("docit-2fa-pending", pending, {
        httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
        sameSite: "lax", path: "/", maxAge: 5 * 60,
      });
      return r2fa;
    }

    const sessionId = await createSession(username);
    const response = NextResponse.json({
      success: true,
      username: user.username,
      mustChangePassword: user.mustChangePassword === true,
    });
    response.cookies.set(getSessionCookieName(), sessionId, {
      httpOnly: true, secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
      sameSite: "lax", path: "/", maxAge: 60 * 60 * 8,
    });
    auditLog(request, { event: "auth.login", outcome: "success", actor: username, sessionType: "session" });
    return response;
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
