import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateMirthServer, deleteMirthServer } from "@/lib/mirth";

type Params = { params: Promise<{ id: string }> };

/** PUT /api/mirth/servers/[id] — update server config. Admin only. */
export async function PUT(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const body = await request.json().catch(() => ({})) as {
    name?: string;
    url?: string;
    username?: string;
    password?: string;
    ignoreSslErrors?: boolean;
    enabled?: boolean;
    sortOrder?: number;
  };

  const updated = await updateMirthServer(id, body);
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ server: updated });
}

/** DELETE /api/mirth/servers/[id] — remove a server. Admin only. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const deleted = deleteMirthServer(id);
  if (!deleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
