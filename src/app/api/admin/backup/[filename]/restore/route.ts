import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { restoreBackup } from "@/lib/backup";
import { auditLog } from "@/lib/audit";

type Params = { params: Promise<{ filename: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { filename } = await params;
  const decoded = decodeURIComponent(filename);

  const result = await restoreBackup(decoded);

  auditLog(req, {
    event: "backup.run",
    outcome: result.success ? "success" : "failure",
    actor: user.username,
    details: { action: "restore", filename: decoded, error: result.error },
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? "Restore failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true, filename: decoded });
}
