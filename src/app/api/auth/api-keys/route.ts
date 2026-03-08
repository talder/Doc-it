import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readUserKeyStore,
  createUserApiKey,
} from "@/lib/api-keys";
import { auditLog } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const store = await readUserKeyStore();
  const keys = (store[user.username] ?? []).map(({ keyHash: _, ...k }) => k);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name: string = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const expiresAt: string | undefined =
    typeof body.expiresAt === "string" && body.expiresAt ? body.expiresAt : undefined;

  const { record, secret } = await createUserApiKey(user.username, name, expiresAt);
  auditLog(request, { event: "api_key.create", outcome: "success", actor: user.username, resource: record.id, resourceType: "api-key", details: { name, prefix: record.prefix } });
  return NextResponse.json({ key: record, secret }, { status: 201 });
}
