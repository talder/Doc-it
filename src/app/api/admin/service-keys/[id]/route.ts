import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeServiceApiKey } from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const ok = await revokeServiceApiKey(id);
  if (!ok) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  auditLog(request, { event: "service_key.revoke", outcome: "success", actor: user.username, resource: id, resourceType: "service-key" });
  return NextResponse.json({ success: true });
}
