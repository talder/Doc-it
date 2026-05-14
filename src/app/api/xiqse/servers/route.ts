import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  listXiqseServersPublic, createXiqseServer, updateXiqseServer, deleteXiqseServer,
  testXiqseConnection,
} from "@/lib/xiqse";

/** GET /api/xiqse/servers — list configured XIQ-SE servers (no passwords). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ servers: listXiqseServersPublic() });
}

/** POST /api/xiqse/servers — create a new XIQ-SE server. Admin only. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.name || !body.url || !body.username) {
    return NextResponse.json({ error: "name, url and username are required" }, { status: 400 });
  }

  const server = await createXiqseServer({
    name: String(body.name),
    url: String(body.url),
    username: String(body.username),
    password: String(body.password ?? ""),
    ignoreSslErrors: body.ignoreSslErrors !== false,
    enabled: body.enabled !== false,
    sortOrder: Number(body.sortOrder ?? 0),
  });
  return NextResponse.json({ server }, { status: 201 });
}

/** PUT /api/xiqse/servers — update a server. Admin only. */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const server = await updateXiqseServer(String(body.id), body as Parameters<typeof updateXiqseServer>[1]);
  if (!server) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ server });
}

/** DELETE /api/xiqse/servers — delete a server. Admin only. */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  deleteXiqseServer(String(body.id));
  return NextResponse.json({ ok: true });
}

/** PATCH /api/xiqse/servers — test connection to a server. */
export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const result = await testXiqseConnection(String(body.id));
  return NextResponse.json(result);
}
