import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { revokeUserApiKey } from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const ok = await revokeUserApiKey(user.username, id);
  if (!ok) return NextResponse.json({ error: "Key not found" }, { status: 404 });

  auditLog(request, { event: "api_key.revoke", outcome: "success", actor: user.username, resource: id, resourceType: "api-key" });
  return NextResponse.json({ success: true });
}
