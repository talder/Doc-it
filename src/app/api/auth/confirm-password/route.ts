import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, verifyPassword } from "@/lib/auth";
import { getAdConfig, authenticateAdUser } from "@/lib/ad";
import { auditLog } from "@/lib/audit";

const AUDIT_AUTH_COOKIE = "docit-audit-auth";
const VALIDITY_SECONDS = 15 * 60; // 15 minutes

/** GET — check whether the audit-auth confirmation cookie is still valid */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ confirmed: false });

  const raw = request.cookies.get(AUDIT_AUTH_COOKIE)?.value;
  if (!raw) return NextResponse.json({ confirmed: false });

  try {
    const { username, expiresAt } = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
    if (username !== user.username) return NextResponse.json({ confirmed: false });
    if (new Date(expiresAt) < new Date()) return NextResponse.json({ confirmed: false });
    return NextResponse.json({ confirmed: true });
  } catch {
    return NextResponse.json({ confirmed: false });
  }
}

/** POST — verify password, issue audit-auth cookie valid for 15 minutes */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { password } = await request.json();
  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  let verified = false;
  if (user.authSource === "ad") {
    const adConfig = await getAdConfig();
    const result = await authenticateAdUser(adConfig, user.adUsername ?? user.username, password);
    verified = result.success;
  } else {
    const { match } = await verifyPassword(password, user.passwordHash);
    verified = match;
  }

  if (!verified) {
    auditLog(request, { event: "auth.sudo", outcome: "failure", actor: user.username, details: { reason: "incorrect password" } });
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const payload = Buffer.from(
    JSON.stringify({
      username: user.username,
      expiresAt: new Date(Date.now() + VALIDITY_SECONDS * 1000).toISOString(),
    })
  ).toString("base64");

  auditLog(request, { event: "auth.sudo", outcome: "success", actor: user.username });

  const response = NextResponse.json({ confirmed: true });
  response.cookies.set(AUDIT_AUTH_COOKIE, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.SECURE_COOKIES !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: VALIDITY_SECONDS,
  });

  return response;
}
