/**
 * POST /api/auth/totp/force-setup
 *
 * Generates a TOTP secret + QR code for a user who has just authenticated with
 * their password but has not yet enrolled in MFA.  Authentication is via the
 * signed `docit-mfa-setup-pending` cookie set by the login route.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyMfaPending } from "@/app/api/auth/login/route";
import { checkRateLimit } from "@/lib/rate-limit";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

export async function POST(request: NextRequest) {
  const blocked = checkRateLimit(request, "auth");
  if (blocked) return blocked;
  const raw = request.cookies.get("docit-mfa-setup-pending")?.value;
  if (!raw) return NextResponse.json({ error: "No MFA setup session" }, { status: 401 });

  const pending = verifyMfaPending(raw);
  if (!pending) return NextResponse.json({ error: "Invalid or expired MFA setup session" }, { status: 401 });

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: "Doc-it",
    label: pending.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qr = await QRCode.toDataURL(uri);

  return NextResponse.json({ secret: secret.base32, uri, qr });
}
