import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir } from "@/lib/config";
import { parseFrontmatter } from "@/lib/frontmatter";
import { getDb } from "@/lib/config";
import { listEnhancedTables } from "@/lib/enhanced-table";

type Params = { params: Promise<{ slug: string }> };

const EXCLUDED = new Set(["attachments", ".git", ".DS_Store", ".databases", ".doc-status.json", ".customization.json", ".tags.json", "trash"]);
const MAX_RESULTS = 30;
const SNIPPET_RADIUS = 80; // characters around match

interface SearchResult {
  name: string;
  category: string;
  matchType: "name" | "content" | "tag" | "both" | "attachment";
  snippet?: string;
  author?: string;
  updatedAt?: string;
  classification?: string;
  tags?: string[];
  // attachment-specific
  attachmentName?: string;
  attachmentId?: string;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract a snippet around the first match, with <mark> tags */
function extractSnippet(text: string, query: string, radius: number): string | undefined {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(query.toLowerCase());
  if (idx === -1) return undefined;

  const start = Math.max(0, idx - radius);
  const end = Math.min(text.length, idx + query.length + radius);
  let snippet = text.slice(start, end);

  // Trim to word boundaries
  if (start > 0) snippet = "…" + snippet.slice(snippet.indexOf(" ") + 1);
  if (end < text.length) snippet = snippet.slice(0, snippet.lastIndexOf(" ")) + "…";

  // Wrap match in <mark>
  const re = new RegExp(`(${escapeRegex(query)})`, "gi");
  snippet = snippet.replace(re, "<mark>$1</mark>");

  return snippet;
}

/** Recursively scan docs and match against query + filters */
async function searchDocs(
  dir: string,
  categoryPath: string,
  query: string,
  queryLower: string,
  filters: {
    category?: string;
    tag?: string;
    author?: string;
    classification?: string;
    from?: string;
    to?: string;
  },
  results: SearchResult[],
): Promise<void> {
  if (results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) return;
    if (entry.name.startsWith(".") || EXCLUDED.has(entry.name)) continue;

    if (entry.isDirectory()) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      await searchDocs(path.join(dir, entry.name), subPath, query, queryLower, filters, results);
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".mdt"))) {
      const docName = entry.name.replace(/\.mdt?$/, "");

      // Category filter
      if (filters.category && categoryPath !== filters.category && !categoryPath.startsWith(filters.category + "/")) {
        continue;
      }

      let raw: string;
      try {
        raw = await fs.readFile(path.join(dir, entry.name), "utf-8");
      } catch {
        continue;
      }

      const { body, metadata } = parseFrontmatter(raw);

      // Author filter
      if (filters.author && metadata.updatedBy !== filters.author && metadata.createdBy !== filters.author) {
        continue;
      }

      // Classification filter
      if (filters.classification && (metadata.classification || "internal") !== filters.classification) {
        continue;
      }

      // Date range filter
      if (filters.from && metadata.updatedAt && metadata.updatedAt < filters.from) continue;
      if (filters.to && metadata.updatedAt && metadata.updatedAt > filters.to) continue;

      // Tag filter
      const docTags = metadata.tags || [];
      if (filters.tag && !docTags.some((t) => t.toLowerCase() === filters.tag!.toLowerCase())) {
        continue;
      }

      // Match: name, tags, or content
      const nameMatch = docName.toLowerCase().includes(queryLower);
      const tagMatch = docTags.some((t) => t.toLowerCase().includes(queryLower));
      const contentMatch = !nameMatch && body.toLowerCase().includes(queryLower);

      if (!nameMatch && !tagMatch && !contentMatch) continue;

      const snippet = contentMatch ? extractSnippet(body, query, SNIPPET_RADIUS) : undefined;

      let matchType: SearchResult["matchType"] = "content";
      if (nameMatch && contentMatch) matchType = "both";
      else if (nameMatch || tagMatch) matchType = "name";

      results.push({
        name: docName,
        category: categoryPath,
        matchType,
        snippet,
        author: metadata.updatedBy || metadata.createdBy,
        updatedAt: metadata.updatedAt,
        classification: metadata.classification,
        tags: docTags.length > 0 ? docTags : undefined,
      });
    }
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const sp = request.nextUrl.searchParams;
  const query = (sp.get("q") || "").trim();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const filters = {
    category: sp.get("category") || undefined,
    tag: sp.get("tag") || undefined,
    author: sp.get("author") || undefined,
    classification: sp.get("classification") || undefined,
    from: sp.get("from") || undefined,
    to: sp.get("to") || undefined,
  };

  const spaceDir = getSpaceDir(slug);
  const results: SearchResult[] = [];
  await searchDocs(spaceDir, "", query, query.toLowerCase(), filters, results);

  // Attachment text search (PDF text layer via blobstore)
  if (results.length < MAX_RESULTS) {
    try {
      const db = getDb();
      const attHits = db.prepare(`
        SELECT r.id, r.original_name, r.doc_category, r.doc_name, b.text_content
        FROM attachment_refs r
        JOIN blobs b ON r.sha256 = b.sha256
        WHERE r.space_slug = ?
          AND b.text_content IS NOT NULL
          AND lower(b.text_content) LIKE ?
        LIMIT ?
      `).all(slug, `%${query.toLowerCase()}%`, MAX_RESULTS - results.length) as Array<{
        id: string; original_name: string; doc_category: string;
        doc_name: string; text_content: string;
      }>;

      for (const hit of attHits) {
        const snippet = extractSnippet(hit.text_content, query, SNIPPET_RADIUS);
        results.push({
          name: hit.doc_name || hit.original_name,
          category: hit.doc_category || "",
          matchType: "attachment",
          snippet,
          attachmentName: hit.original_name,
          attachmentId: hit.id,
        });
      }
    } catch { /* blobstore tables not yet initialised — skip silently */ }
  }

  // Enhanced table row search
  const dbResults: { dbId: string; dbTitle: string; rowId: string; matchValues: string[] }[] = [];
  if (results.length < MAX_RESULTS) {
    try {
      const tables = await listEnhancedTables(slug);
      for (const table of tables) {
        if (dbResults.length >= 10) break;
        for (const row of table.rows) {
          const matchVals: string[] = [];
          for (const col of table.columns) {
            const val = row.cells[col.id];
            if (val == null) continue;
            const str = Array.isArray(val) ? val.join(", ") : String(val);
            if (str.toLowerCase().includes(query.toLowerCase())) {
              matchVals.push(str);
            }
          }
          if (matchVals.length > 0) {
            dbResults.push({ dbId: table.id, dbTitle: table.title, rowId: row.id, matchValues: matchVals });
            if (dbResults.length >= 10) break;
          }
        }
      }
    } catch { /* skip */ }
  }

  // Sort: name matches first, then content matches, then by recency
  results.sort((a, b) => {
    const typeOrder: Record<string, number> = { name: 0, both: 0, tag: 1, content: 2, attachment: 3 };
    const ta = typeOrder[a.matchType] ?? 2;
    const tb = typeOrder[b.matchType] ?? 2;
    if (ta !== tb) return ta - tb;
    // Within same type, sort by updatedAt desc
    return (b.updatedAt || "").localeCompare(a.updatedAt || "");
  });

  return NextResponse.json({ results, dbResults });
}
