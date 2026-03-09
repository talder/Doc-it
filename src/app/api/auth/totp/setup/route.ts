import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import * as OTPAuth from "otpauth";
import QRCode from "qrcode";

export async function POST(_req: NextRequest) {
  const blocked = checkRateLimit(_req, "auth");
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Generate a new random TOTP secret
  const secret = new OTPAuth.Secret({ size: 20 });

  const totp = new OTPAuth.TOTP({
    issuer: "Doc-it",
    label: user.username,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  const uri = totp.toString();
  const qr = await QRCode.toDataURL(uri);

  return NextResponse.json({
    secret: secret.base32,
    uri,
    qr, // data URL — render as <img src={qr} />
  });
}
