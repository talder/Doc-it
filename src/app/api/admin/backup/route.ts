import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBackupConfig, saveBackupConfig, listBackups, runBackup } from "@/lib/backup";
import { auditLog } from "@/lib/audit";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return null;
  return user;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const [config, backups] = await Promise.all([getBackupConfig(), listBackups()]);
  // Strip passwords from config before returning
  const safeConfig = {
    ...config,
    targets: config.targets.map((t) =>
      t.type === "cifs" ? { ...t, password: t.password ? "••••••" : "" } : t
    ),
  };
  return NextResponse.json({ config: safeConfig, backups });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = await request.json();
  // If a CIFS password comes back as "••••••", preserve the existing encrypted value
  const current = await getBackupConfig();
  const mergedTargets = (body.targets ?? []).map((t: Record<string, unknown>) => {
    if (t.type === "cifs" && t.password === "••••••") {
      const existing = current.targets.find((c) => c.id === t.id);
      if (existing && existing.type === "cifs") return { ...t, password: existing.password };
    }
    return t;
  });
  await saveBackupConfig({ ...body, targets: mergedTargets });
  auditLog(request, { event: "settings.update", outcome: "success", actor: admin.username, details: { setting: "backup" } });
  return NextResponse.json({ success: true });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const result = await runBackup();
  auditLog(request, { event: "backup.run", outcome: result.success ? "success" : "failure", actor: admin.username, details: { filename: result.filename, error: result.error, targets: result.targetResults } });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Backup failed", targetResults: result.targetResults }, { status: 500 });
  }
  return NextResponse.json({ success: true, filename: result.filename, targetResults: result.targetResults });
}
