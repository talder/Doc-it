import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addLink, updateLink, deleteLink } from "@/lib/dashboard";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const title: string = (body.title ?? "").trim();
  const url: string = (body.url ?? "").trim();
  const sectionId: string = (body.sectionId ?? "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  if (!sectionId) return NextResponse.json({ error: "sectionId is required" }, { status: 400 });

  const link = await addLink({
    title,
    url,
    sectionId,
    description: body.description,
    icon: body.icon,
    color: body.color,
    openInNewTab: body.openInNewTab,
    visibleToGroups: body.visibleToGroups,
  });
  return NextResponse.json(link, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id: string = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updated = await updateLink(id, {
    title: body.title,
    description: body.description,
    url: body.url,
    icon: body.icon,
    color: body.color,
    openInNewTab: body.openInNewTab,
    sectionId: body.sectionId,
    order: body.order,
    visibleToGroups: body.visibleToGroups,
  });
  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id: string = (body.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const ok = await deleteLink(id);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
