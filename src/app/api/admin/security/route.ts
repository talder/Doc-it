import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getKeyFingerprint, getSecretKeyBase64 } from "@/lib/crypto";
import { rotateAllEncryption } from "@/lib/key-rotation";
import { auditLog } from "@/lib/audit";

/** GET /api/admin/security — returns key fingerprint */
export async function GET() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const fingerprint = await getKeyFingerprint();
  return NextResponse.json({ fingerprint });
}

/** POST /api/admin/security — action: "export-key" | "rotate-key" */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { action } = await req.json();

  if (action === "export-key") {
    const keyBase64 = await getSecretKeyBase64();
    auditLog(req, {
      event: "settings.update",
      outcome: "success",
      actor: user.username,
      details: { action: "export-encryption-key" },
    });
    return NextResponse.json({ keyBase64 });
  }

  if (action === "rotate-key") {
    try {
      const summary = await rotateAllEncryption();
      auditLog(req, {
        event: "settings.update",
        outcome: "success",
        actor: user.username,
        details: {
          action: "rotate-encryption-key",
          totpSecretsRotated: summary.totpSecretsRotated,
          cifsPasswordsRotated: summary.cifsPasswordsRotated,
          backupFilesRotated: summary.backupFilesRotated,
          errors: summary.errors.length,
        },
      });
      return NextResponse.json({ success: true, summary });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Key rotation failed" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
