import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readUserGroups, addUserGroup, updateUserGroup, deleteUserGroup } from "@/lib/user-groups";
import { auditLog } from "@/lib/audit";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const data = await readUserGroups();
  return NextResponse.json(data.groups);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const name: string = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const group = await addUserGroup({
    name,
    description: body.description,
    members: body.members,
  });
  auditLog(request, { event: "user.group.create", outcome: "success", actor: user.username, resource: group.id, resourceType: "user-group", details: { name } });
  return NextResponse.json(group, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id: string = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await updateUserGroup(id, {
    name: body.name,
    description: body.description,
    members: body.members,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  auditLog(request, { event: "user.group.update", outcome: "success", actor: user.username, resource: id, resourceType: "user-group", details: { name: body.name, members: body.members } });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const ok = await deleteUserGroup(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  auditLog(request, { event: "user.group.delete", outcome: "success", actor: user.username, resource: id, resourceType: "user-group" });
  return NextResponse.json({ ok: true });
}
