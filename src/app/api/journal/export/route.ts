import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readUserJournal, filterEntries } from "@/lib/journal";

/** GET /api/journal/export?from=&to=&format=md|json */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const format = sp.get("format") || "md";
  const journal = await readUserJournal(user.username);

  const entries = filterEntries(journal.entries, {
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  }).sort((a, b) => a.date.localeCompare(b.date));

  if (format === "json") {
    return new NextResponse(JSON.stringify(entries, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="journal-export.json"`,
      },
    });
  }

  // Markdown
  const md = entries
    .map((e) => {
      const header = `# ${e.title}\n**Date:** ${e.date}${e.mood ? ` | **Mood:** ${e.mood}` : ""}${e.tags.length ? ` | **Tags:** ${e.tags.map((t) => `#${t}`).join(" ")}` : ""}\n`;
      return header + "\n" + e.content;
    })
    .join("\n\n---\n\n");

  return new NextResponse(md, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="journal-export.md"`,
    },
  });
}
