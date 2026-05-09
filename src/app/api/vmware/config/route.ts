import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readVmwareConfig, saveVmwareConfig } from "@/lib/vmware";

/** GET /api/vmware/config — returns config without the encrypted password. Admin only. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cfg = await readVmwareConfig();
  return NextResponse.json({
    enabled: cfg.enabled,
    vcenterUrl: cfg.vcenterUrl,
    username: cfg.username,
    passwordSet: !!cfg.passwordEncrypted,
    ignoreSslErrors: cfg.ignoreSslErrors,
    allowedUsers: cfg.allowedUsers,
    victoriaLogsUrl: cfg.victoriaLogsUrl ?? "",
  });
}

/** PUT /api/vmware/config — save vCenter config. Admin only. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const {
    enabled,
    vcenterUrl,
    username,
    password,
    ignoreSslErrors,
    allowedUsers,
    victoriaLogsUrl,
  } = body;

  await saveVmwareConfig({
    ...(enabled !== undefined ? { enabled: !!enabled } : {}),
    ...(vcenterUrl !== undefined ? { vcenterUrl: String(vcenterUrl).trim() } : {}),
    ...(username !== undefined ? { username: String(username).trim() } : {}),
    ...(password !== undefined ? { password: String(password) } : {}),
    ...(ignoreSslErrors !== undefined ? { ignoreSslErrors: !!ignoreSslErrors } : {}),
    ...(Array.isArray(allowedUsers) ? {
      allowedUsers: allowedUsers.filter((u: unknown) => typeof u === "string" && u.trim()).map((u: string) => u.trim()),
    } : {}),
    ...(victoriaLogsUrl !== undefined ? { victoriaLogsUrl: String(victoriaLogsUrl).trim() } : {}),
  });

  return NextResponse.json({ ok: true });
}
