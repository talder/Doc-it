import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import {
  readSpaceJournal,
  writeSpaceJournal,
  createEntry,
  filterEntries,
} from "@/lib/journal";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/spaces/[slug]/journal/entries */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "reader"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const journal = await readSpaceJournal(slug);

  const filtered = filterEntries(journal.entries || [], {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    tag: sp.get("tag") || undefined,
    pinned: sp.has("pinned") ? sp.get("pinned") === "true" : undefined,
    search: sp.get("search") || undefined,
  });

  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ entries: filtered });
}

/** POST /api/spaces/[slug]/journal/entries */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { date, title, content, tags, mood } = await request.json();
  if (!date || !content) {
    return NextResponse.json({ error: "date and content required" }, { status: 400 });
  }

  const journal = await readSpaceJournal(slug);
  const entry = createEntry({ date, title, content, tags, mood, author: user.username });
  journal.entries.push(entry);
  await writeSpaceJournal(slug, journal);

  return NextResponse.json({ entry });
}

/** PUT /api/spaces/[slug]/journal/entries */
export async function PUT(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try {
    ({ user } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { id, ...updates } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const journal = await readSpaceJournal(slug);
  const idx = journal.entries.findIndex((e) => e.id === id);
  if (idx === -1) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  const allowed = ["date", "title", "content", "tags", "mood", "pinned"] as const;
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      (journal.entries[idx] as any)[key] = updates[key];
    }
  }
  journal.entries[idx].updatedAt = new Date().toISOString();

  await writeSpaceJournal(slug, journal);
  return NextResponse.json({ entry: journal.entries[idx] });
}

/** DELETE /api/spaces/[slug]/journal/entries?id= */
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
  const before = journal.entries.length;
  journal.entries = journal.entries.filter((e) => e.id !== id);
  if (journal.entries.length === before) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await writeSpaceJournal(slug, journal);
  return NextResponse.json({ success: true });
}
