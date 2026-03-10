import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getAdConfig,
  saveAdConfig,
  sanitizeAdConfig,
  testAdConnection,
  encryptBindPassword,
} from "@/lib/ad";
import { auditLog } from "@/lib/audit";

// GET — return sanitized AD config (no plaintext password)
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const config = await getAdConfig();
    return NextResponse.json(sanitizeAdConfig(config));
  } catch (err) {
    console.error("AD settings GET error:", err);
    return NextResponse.json({ error: "Failed to load AD settings" }, { status: 500 });
  }
}

// PUT — save AD config; optional plaintext bindPassword is encrypted before storage
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const existing = await getAdConfig();

    // Merge supplied fields onto existing config
    const updated = { ...existing };

    if (typeof body.enabled === "boolean") updated.enabled = body.enabled;
    if (typeof body.host === "string") updated.host = body.host.trim();
    if (typeof body.port === "number") updated.port = body.port;
    if (typeof body.ssl === "boolean") updated.ssl = body.ssl;
    if (typeof body.tlsRejectUnauthorized === "boolean")
      updated.tlsRejectUnauthorized = body.tlsRejectUnauthorized;
    if (typeof body.bindDn === "string") updated.bindDn = body.bindDn.trim();
    if (typeof body.baseDn === "string") updated.baseDn = body.baseDn.trim();
    if (typeof body.userSearchBase === "string")
      updated.userSearchBase = body.userSearchBase.trim();
    if (Array.isArray(body.allowedGroups)) updated.allowedGroups = body.allowedGroups;
    if (Array.isArray(body.allowedUsers)) updated.allowedUsers = body.allowedUsers;
    if (Array.isArray(body.groupMappings)) updated.groupMappings = body.groupMappings;

    // Only update bind password if a new plaintext value was supplied
    if (typeof body.bindPassword === "string" && body.bindPassword.length > 0) {
      updated.bindPasswordEncrypted = await encryptBindPassword(body.bindPassword);
    }

    await saveAdConfig(updated);
    auditLog(request, { event: "settings.update", outcome: "success", actor: user.username, resource: "ad-config", resourceType: "settings", details: { enabled: updated.enabled, host: updated.host } });
    return NextResponse.json(sanitizeAdConfig(updated));
  } catch (err) {
    console.error("AD settings PUT error:", err);
    return NextResponse.json({ error: "Failed to save AD settings" }, { status: 500 });
  }
}

// POST — test connection or other actions
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();

    if (body.action === "test") {
      const saved = await getAdConfig();

      // Merge form values from request body over the saved config so the test
      // reflects what the admin has typed even before saving.
      const config = { ...saved };
      if (typeof body.host === "string") config.host = body.host.trim();
      if (typeof body.port === "number") config.port = body.port;
      if (typeof body.ssl === "boolean") config.ssl = body.ssl;
      if (typeof body.tlsRejectUnauthorized === "boolean")
        config.tlsRejectUnauthorized = body.tlsRejectUnauthorized;
      if (typeof body.bindDn === "string") config.bindDn = body.bindDn.trim();
      if (typeof body.baseDn === "string") config.baseDn = body.baseDn.trim();
      if (typeof body.userSearchBase === "string")
        config.userSearchBase = body.userSearchBase.trim();
      // If a plaintext password was sent use it, otherwise keep the saved encrypted one.
      if (typeof body.bindPassword === "string" && body.bindPassword.length > 0)
        config.bindPasswordEncrypted = await encryptBindPassword(body.bindPassword);

      const result = await testAdConnection(config);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("AD settings POST error:", err);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
