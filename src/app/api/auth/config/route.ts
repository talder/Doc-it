import { NextResponse } from "next/server";
import { getAdConfig } from "@/lib/ad";

/**
 * Public endpoint — no authentication required.
 * Returns minimal auth configuration the login page needs before the user
 * has authenticated (e.g. whether to show the AD or local login form).
 */
/** Derive a human-readable domain string from an LDAP Base DN.
 * e.g. "DC=sezz,DC=be" → "sezz.be" */
function domainFromBaseDn(baseDn: string): string {
  return baseDn
    .split(",")
    .filter((p) => p.trim().toLowerCase().startsWith("dc="))
    .map((p) => p.trim().slice(3))
    .join(".");
}

export async function GET() {
  try {
    const adConfig = await getAdConfig();
    const adDomain = adConfig.baseDn ? domainFromBaseDn(adConfig.baseDn) : "";
    return NextResponse.json({ adEnabled: adConfig.enabled, adDomain });
  } catch {
    return NextResponse.json({ adEnabled: false, adDomain: "" });
  }
}
