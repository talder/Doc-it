import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readServiceKeys, createServiceApiKey } from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";
import type { SpaceRole } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const keys = (await readServiceKeys()).map(({ keyHash: _, ...k }) => k);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name: string = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const permissions: Record<string, SpaceRole> = body.permissions ?? {};
  if (Object.keys(permissions).length === 0) {
    return NextResponse.json(
      { error: "At least one space permission is required" },
      { status: 400 }
    );
  }

  const expiresAt: string | undefined =
    typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : undefined;

  const { record, secret } = await createServiceApiKey(
    user.username,
    name,
    permissions,
    expiresAt
  );
  auditLog(request, { event: "service_key.create", outcome: "success", actor: user.username, resource: record.id, resourceType: "service-key", details: { name, prefix: record.prefix } });
  return NextResponse.json({ key: record, secret }, { status: 201 });
}
