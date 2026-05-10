import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listMirthServersPublic, createMirthServer } from "@/lib/mirth";

/** GET /api/mirth/servers — list all Mirth servers (no passwords). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ servers: listMirthServersPublic() });
}

/** POST /api/mirth/servers — create a new Mirth server. Admin only. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    name?: string;
    url?: string;
    username?: string;
    password?: string;
    ignoreSslErrors?: boolean;
    enabled?: boolean;
    sortOrder?: number;
  };

  if (!body.name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!body.url?.trim())  return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!body.username?.trim()) return NextResponse.json({ error: "username is required" }, { status: 400 });

  const server = await createMirthServer({
    name: body.name,
    url: body.url,
    username: body.username,
    password: body.password ?? "",
    ignoreSslErrors: body.ignoreSslErrors !== false, // default true
    enabled: body.enabled !== false,
    sortOrder: body.sortOrder ?? 0,
  });

  return NextResponse.json({ server }, { status: 201 });
}
