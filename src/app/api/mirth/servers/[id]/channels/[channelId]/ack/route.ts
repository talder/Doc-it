import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acknowledgeMirthErrors } from "@/lib/mirth";
import { auditLog } from "@/lib/audit";

/**
 * POST — acknowledge errors for a channel up to the given count.
 * Body: { upToErrors: number }
 * After this, errors at or below `upToErrors` won't trigger the error health
 * state until the channel accumulates more errors beyond this baseline.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; channelId: string }> },
) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { id, channelId } = await params;
  const body = await req.json().catch(() => ({}));
  const upToErrors = Number(body.upToErrors ?? 0);

  acknowledgeMirthErrors(id, channelId, upToErrors);
  auditLog(req, {
    event: "mirth.channel.errors.acked",
    outcome: "success",
    resource: channelId,
    resourceType: "mirth-channel",
    details: { serverId: id, channelId, ackedErrors: upToErrors },
  });
  return NextResponse.json({ ok: true, serverId: id, channelId, ackedErrors: upToErrors });
}
