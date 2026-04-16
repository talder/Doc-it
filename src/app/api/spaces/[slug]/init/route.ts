/**
 * GET /api/spaces/[slug]/init
 *
 * Returns all data needed to render the space sidebar and home view in a
 * single HTTP response. Replaces 8 parallel requests with 1, and uses an
 * in-memory cache so repeat space switches are instant.
 *
 * Response shape:
 *   { categories, docs, tags, templates, members, customization, databases, statuses }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { getUsers } from "@/lib/auth";
import { getSpaceDir } from "@/lib/config";
import { readCustomization, readDocStatusMap } from "@/lib/config";
import { listEnhancedTables } from "@/lib/enhanced-table";
import { scanDocs, buildCategoryTree, getTagsIndex, scanTemplates } from "@/lib/space-data";
import { getSpaceCache, setSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;

  let space: import("@/lib/types").Space;
  try {
    const result = await requireSpaceRole(slug, "reader");
    space = result.space;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  // Cache hit — return immediately
  const cached = getSpaceCache(slug);
  if (cached) {
    return NextResponse.json(cached);
  }

  // Cache miss — run all scans in parallel (single auth check above already done)
  const spaceDir = getSpaceDir(slug);
  const initStart = Date.now();

  const [categories, docs, tags, templates, allUsers, customization, databases, statuses] =
    await Promise.all([
      buildCategoryTree(spaceDir).then(r => { console.log(`[init] buildCategoryTree: ${Date.now()-initStart}ms`); return r; }),
      scanDocs(spaceDir, slug).then(r => { console.log(`[init] scanDocs: ${Date.now()-initStart}ms`); return r; }),
      getTagsIndex(slug).then(r => { console.log(`[init] getTagsIndex: ${Date.now()-initStart}ms`); return r; }),
      scanTemplates(spaceDir, slug).then(r => { console.log(`[init] scanTemplates: ${Date.now()-initStart}ms`); return r; }),
      getUsers().then(r => { console.log(`[init] getUsers: ${Date.now()-initStart}ms`); return r; }),
      readCustomization(slug).then(r => { console.log(`[init] readCustomization: ${Date.now()-initStart}ms`); return r; }),
      listEnhancedTablesMeta(slug).then(r => { console.log(`[init] listEnhancedTablesMeta: ${Date.now()-initStart}ms`); return r; }),
      readDocStatusMap(slug).then(r => { console.log(`[init] readDocStatusMap: ${Date.now()-initStart}ms`); return r; }),
    ]);
  console.log(`[init] total: ${Date.now()-initStart}ms, docs: ${docs.length}, tables: ${databases.length}`);

  // Members: admins + users with writer/admin role in this space
  const members = allUsers
    .filter((u) => {
      if (u.isAdmin) return true;
      const role = space.permissions[u.username];
      return role === "writer" || role === "admin";
    })
    .map((u) => ({ username: u.username, fullName: u.fullName }));

  // Databases: strip rows for lightweight listing
  const databases = rawDbs.map((db) => {
    const { rows, ...rest } = db;
    return { ...rest, rowCount: Array.isArray(rows) ? rows.length : 0 };
  });

  const payload = { categories, docs, tags, templates, members, customization, databases, statuses };
  setSpaceCache(slug, payload);

  return NextResponse.json(payload);
}
