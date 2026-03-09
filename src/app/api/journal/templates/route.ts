import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { readUserJournal, writeUserJournal } from "@/lib/journal";

/** GET /api/journal/templates */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const journal = await readUserJournal(user.username);
  return NextResponse.json({ templates: journal.templates || [] });
}

/** POST /api/journal/templates — create template */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, content, tags } = await request.json();
  if (!name || !content) {
    return NextResponse.json({ error: "name and content required" }, { status: 400 });
  }

  const journal = await readUserJournal(user.username);
  const template = {
    id: randomUUID(),
    name,
    content,
    tags: tags || [],
    scope: "user" as const,
    createdBy: user.username,
  };
  journal.templates.push(template);
  await writeUserJournal(user.username, journal);

  return NextResponse.json({ template });
}

/** DELETE /api/journal/templates?id= */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const journal = await readUserJournal(user.username);
  journal.templates = (journal.templates || []).filter((t) => t.id !== id);
  await writeUserJournal(user.username, journal);

  return NextResponse.json({ success: true });
}
