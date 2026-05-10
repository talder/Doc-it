import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { acknowledgeMirthErrors } from "@/lib/mirth";

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
  return NextResponse.json({ ok: true, serverId: id, channelId, ackedErrors: upToErrors });
}
