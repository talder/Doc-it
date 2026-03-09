import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireSpaceRole } from "@/lib/permissions";
import { readSpaceJournal, writeSpaceJournal } from "@/lib/journal";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/spaces/[slug]/journal/templates */
export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const journal = await readSpaceJournal(slug);
  return NextResponse.json({ templates: journal.templates || [] });
}

/** POST /api/spaces/[slug]/journal/templates */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { name, content, tags } = await request.json();
  if (!name || !content) {
    return NextResponse.json({ error: "name and content required" }, { status: 400 });
  }

  const journal = await readSpaceJournal(slug);
  const template = {
    id: randomUUID(),
    name,
    content,
    tags: tags || [],
    scope: "space" as const,
    createdBy: user.username,
  };
  if (!journal.templates) journal.templates = [];
  journal.templates.push(template);
  await writeSpaceJournal(slug, journal);

  return NextResponse.json({ template });
}

/** DELETE /api/spaces/[slug]/journal/templates?id= */
export async function DELETE(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const journal = await readSpaceJournal(slug);
  journal.templates = (journal.templates || []).filter((t) => t.id !== id);
  await writeSpaceJournal(slug, journal);

  return NextResponse.json({ success: true });
}
