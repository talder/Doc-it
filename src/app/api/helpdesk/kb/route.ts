import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/lib/auth";
import { readConfig, getTicket } from "@/lib/helpdesk";
import { getSpaceDir } from "@/lib/config";
import { parseFrontmatter, stringifyFrontmatter } from "@/lib/frontmatter";

const MAX_SUGGESTIONS = 10;
const SNIPPET_RADIUS = 80;

function extractSnippet(text: string, query: string, radius: number): string | undefined {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = "…" + snippet.slice(snippet.indexOf(" ") + 1);
  if (end < text.length) snippet = snippet.slice(0, snippet.lastIndexOf(" ")) + "…";
  return snippet;
}

interface KbResult {
  name: string;
  category: string;
  snippet?: string;
  updatedAt?: string;
}

const EXCLUDED = new Set(["attachments", ".git", ".DS_Store", ".databases", ".doc-status.json", ".customization.json", ".tags.json", "trash"]);

async function searchKbDocs(
  dir: string, categoryPath: string, queryLower: string, results: KbResult[],
): Promise<void> {
  if (results.length >= MAX_SUGGESTIONS) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (results.length >= MAX_SUGGESTIONS) return;
    if (entry.name.startsWith(".") || EXCLUDED.has(entry.name)) continue;
    if (entry.isDirectory()) {
      await searchKbDocs(path.join(dir, entry.name), categoryPath ? `${categoryPath}/${entry.name}` : entry.name, queryLower, results);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      const docName = entry.name.replace(/\.md$/, "");
      let raw: string;
      try { raw = await fs.readFile(path.join(dir, entry.name), "utf-8"); } catch { continue; }
      const { body, metadata } = parseFrontmatter(raw);
      const nameMatch = docName.toLowerCase().includes(queryLower);
      const contentMatch = body.toLowerCase().includes(queryLower);
      const tagMatch = (metadata.tags || []).some((t) => t.toLowerCase().includes(queryLower));
      if (!nameMatch && !contentMatch && !tagMatch) continue;
      results.push({
        name: docName,
        category: categoryPath,
        snippet: contentMatch ? extractSnippet(body, queryLower, SNIPPET_RADIUS) : undefined,
        updatedAt: metadata.updatedAt,
      });
    }
  }
}

/**
 * GET /api/helpdesk/kb?q=<keyword>
 * Search the configured KB space for article suggestions.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await readConfig();
  if (!cfg.kbSpaceSlug) return NextResponse.json({ results: [], message: "No KB space configured" });

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const spaceDir = getSpaceDir(cfg.kbSpaceSlug);
  const results: KbResult[] = [];
  await searchKbDocs(spaceDir, "", q.toLowerCase(), results);

  return NextResponse.json({ results, spaceSlug: cfg.kbSpaceSlug });
}

/**
 * POST /api/helpdesk/kb — convert a ticket resolution into a KB article.
 * Body: { ticketId, category?, title? }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cfg = await readConfig();
  if (!cfg.kbSpaceSlug) return NextResponse.json({ error: "No KB space configured" }, { status: 400 });

  const body = await request.json();
  const { ticketId, category, title } = body;
  if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

  const ticket = await getTicket(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // Build article content from ticket resolution
  const articleTitle = title || `KB: ${ticket.subject}`;
  const resolutionComment = [...ticket.comments].reverse().find((c) => !c.isInternal);
  const articleBody = [
    `# ${articleTitle}`,
    "",
    "## Problem",
    ticket.description || "_No description_",
    "",
    ...(ticket.rootCause ? ["## Root Cause", ticket.rootCause, ""] : []),
    ...(ticket.workaround ? ["## Workaround", ticket.workaround, ""] : []),
    "## Resolution",
    resolutionComment?.content || "_Resolved via ticket " + ticket.id + "_",
    "",
    `_Auto-generated from helpdesk ticket ${ticket.id}_`,
  ].join("\n");

  const now = new Date().toISOString();
  const content = stringifyFrontmatter(articleBody, {
    createdAt: now,
    createdBy: user.username,
    updatedAt: now,
    updatedBy: user.username,
    tags: ["kb", "helpdesk", `ticket:${ticket.id}`],
  });

  // Write the article to the KB space
  const targetCategory = category || "Knowledge Base";
  const spaceDir = getSpaceDir(cfg.kbSpaceSlug);
  const catDir = path.join(spaceDir, targetCategory);
  await fs.mkdir(catDir, { recursive: true });

  const safeName = articleTitle.replace(/[<>:"/\\|?*]+/g, "-").slice(0, 120);
  const filePath = path.join(catDir, `${safeName}.md`);
  await fs.writeFile(filePath, content, "utf-8");

  return NextResponse.json({
    ok: true,
    article: { name: safeName, category: targetCategory, spaceSlug: cfg.kbSpaceSlug },
  });
}
