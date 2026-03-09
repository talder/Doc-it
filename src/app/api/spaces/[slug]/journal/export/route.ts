import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readSpaceJournal, filterEntries } from "@/lib/journal";

type Params = { params: Promise<{ slug: string }> };

/** GET /api/spaces/[slug]/journal/export?from=&to=&format=md|json */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") || "md";
  const journal = await readSpaceJournal(slug);

  const entries = filterEntries(journal.entries || [], {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (format === "json") {
    return new NextResponse(JSON.stringify(entries, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${slug}-journal-export.json"`,
      },
    });
  }

  const md = entries
    .map((e) => {
      const header = `# ${e.title}\n**Date:** ${e.date} | **Author:** ${e.author}${e.mood ? ` | **Mood:** ${e.mood}` : ""}${e.tags.length ? ` | **Tags:** ${e.tags.map((t) => `#${t}`).join(" ")}` : ""}\n`;
      return header + "\n" + e.content;
    })
    .join("\n\n---\n\n");

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-journal-export.md"`,
    },
  });
}
