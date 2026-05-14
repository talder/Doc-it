import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listCheckmkServersPublic, createCheckmkServer, updateCheckmkServer,
  deleteCheckmkServer, testCheckmkConnection,
} from "@/lib/checkmk";

/** GET /api/checkmk/servers — list configured CheckMK servers (no secrets). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ servers: listCheckmkServersPublic() });
}

/** POST /api/checkmk/servers — create a new CheckMK server. Admin only. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.name || !body.url || !body.username) {
    return NextResponse.json({ error: "name, url and username are required" }, { status: 400 });
  }

  const server = await createCheckmkServer({
    name: String(body.name),
    url: String(body.url),
    username: String(body.username),
    secret: String(body.secret ?? ""),
    ignoreSslErrors: body.ignoreSslErrors !== false,
    enabled: body.enabled !== false,
    sortOrder: Number(body.sortOrder ?? 0),
  });
  return NextResponse.json({ server }, { status: 201 });
}

/** PUT /api/checkmk/servers — update a server. Admin only. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const server = await updateCheckmkServer(String(body.id), body as Parameters<typeof updateCheckmkServer>[1]);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ server });
}

/** DELETE /api/checkmk/servers — delete a server. Admin only. */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteCheckmkServer(String(body.id));
  return NextResponse.json({ ok: true });
}

/** PATCH /api/checkmk/servers — test connection to a server. */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const result = await testCheckmkConnection(String(body.id));
  return NextResponse.json(result);
}
