import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  readUserJournal,
  writeUserJournal,
  createEntry,
  filterEntries,
} from "@/lib/journal";

/** GET /api/journal/entries?from=&to=&tag=&pinned=&search= */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const journal = await readUserJournal(user.username);

  const filtered = filterEntries(journal.entries, {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
    tag: sp.get("tag") || undefined,
    pinned: sp.has("pinned") ? sp.get("pinned") === "true" : undefined,
    search: sp.get("search") || undefined,
  });

  // Sort: pinned first, then by date desc
  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
  });

  return NextResponse.json({ entries: filtered });
}

/** POST /api/journal/entries — create entry */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { date, title, content, tags, mood } = body;
  if (!date || !content) {
    return NextResponse.json({ error: "date and content required" }, { status: 400 });
  }

  const journal = await readUserJournal(user.username);
  const entry = createEntry({ date, title, content, tags, mood, author: user.username });
  journal.entries.push(entry);
  await writeUserJournal(user.username, journal);

  return NextResponse.json({ entry });
}

/** PUT /api/journal/entries — update entry */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const journal = await readUserJournal(user.username);
  const idx = journal.entries.findIndex((e) => e.id === id);
  if (idx === -1) return NextResponse.json({ error: "Entry not found" }, { status: 404 });

  // Only allow updating own entries
  if (journal.entries[idx].author !== user.username) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const allowed = ["date", "title", "content", "tags", "mood", "pinned"] as const;
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      (journal.entries[idx] as any)[key] = updates[key];
    }
  }
  journal.entries[idx].updatedAt = new Date().toISOString();

  await writeUserJournal(user.username, journal);
  return NextResponse.json({ entry: journal.entries[idx] });
}

/** DELETE /api/journal/entries?id= */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const journal = await readUserJournal(user.username);
  const before = journal.entries.length;
  journal.entries = journal.entries.filter((e) => e.id !== id);
  if (journal.entries.length === before) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }

  await writeUserJournal(user.username, journal);
  return NextResponse.json({ success: true });
}
