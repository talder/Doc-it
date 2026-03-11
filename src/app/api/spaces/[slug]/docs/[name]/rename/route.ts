import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { auditLog } from "@/lib/audit";
import {
  getCategoryDir,
  getHistoryDir,
  getSpaceDir,
  readDocStatusMap,
  writeDocStatusMap,
  readCustomization,
  writeCustomization,
} from "@/lib/config";
import { getUsers, writeUsers } from "@/lib/auth";
import { invalidateSpaceCache } from "@/lib/space-cache";
import type { FavoriteItem } from "@/lib/types";

type Params = { params: Promise<{ slug: string; name: string }> };

async function resolveDocPath(
  catDir: string,
  name: string,
  preferTemplate?: boolean
): Promise<{ filePath: string; isTemplate: boolean } | null> {
  if (preferTemplate) {
    const mdt = path.join(catDir, `${name}.mdt`);
    try { await fs.access(mdt); return { filePath: mdt, isTemplate: true }; } catch {}
  }
  const md = path.join(catDir, `${name}.md`);
  try { await fs.access(md); return { filePath: md, isTemplate: false }; } catch {}
  const mdt = path.join(catDir, `${name}.mdt`);
  try { await fs.access(mdt); return { filePath: mdt, isTemplate: true }; } catch {}
  return null;
}

/** Recursively collect all .md / .mdt files under a directory. */
async function walkDocs(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...(await walkDocs(full)));
    } else if (e.name.endsWith(".md") || e.name.endsWith(".mdt")) {
      results.push(full);
    }
  }
  return results;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;

  let renamer;
  try {
    ({ user: renamer } = await requireSpaceRole(slug, "writer"));
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const { newName, category, isTemplate } = await request.json();
  if (!newName || category === undefined) {
    return NextResponse.json({ error: "newName and category required" }, { status: 400 });
  }

  const safeName = newName.replace(/[^a-zA-Z0-9-_ ]/g, "").trim();
  if (!safeName) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }

  const catDir = getCategoryDir(slug, category);
  const resolved = await resolveDocPath(catDir, name, !!isTemplate);

  if (!resolved) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const ext = resolved.isTemplate ? ".mdt" : ".md";
  const destPath = path.join(catDir, `${safeName}${ext}`);

  // Check destination doesn't already exist
  try {
    await fs.access(destPath);
    return NextResponse.json({ error: "A document with that name already exists" }, { status: 409 });
  } catch {
    // Good — destination is free
  }

  // ── 1. Rename the document file ─────────────────────────────────────────
  await fs.rename(resolved.filePath, destPath);

  // ── 2. Move history directory ───────────────────────────────────────────
  try {
    const oldHistDir = getHistoryDir(slug, category, name);
    const newHistDir = getHistoryDir(slug, category, safeName);
    await fs.access(oldHistDir);
    await fs.rename(oldHistDir, newHistDir);
  } catch {
    // No history yet — nothing to move
  }

  // ── 3. Update doc status map ───────────────────────────────────────────
  try {
    const statusMap = await readDocStatusMap(slug);
    const oldKey = `${category}/${name}`;
    const newKey = `${category}/${safeName}`;
    if (statusMap[oldKey] !== undefined) {
      statusMap[newKey] = statusMap[oldKey];
      delete statusMap[oldKey];
      await writeDocStatusMap(slug, statusMap);
    }
  } catch {
    // Non-fatal
  }

  // ── 4. Update customization keys (doc icon / color) ──────────────────────
  try {
    const custom = await readCustomization(slug);
    const oldKey = `${category}/${name}`;
    const newKey = `${category}/${safeName}`;
    let changed = false;
    if (custom.docIcons[oldKey] !== undefined) {
      custom.docIcons[newKey] = custom.docIcons[oldKey];
      delete custom.docIcons[oldKey];
      changed = true;
    }
    if (custom.docColors[oldKey] !== undefined) {
      custom.docColors[newKey] = custom.docColors[oldKey];
      delete custom.docColors[oldKey];
      changed = true;
    }
    if (changed) await writeCustomization(slug, custom);
  } catch {
    // Non-fatal
  }

  // ── 5. Update linked-doc embeds in all docs of this space ────────────────
  try {
    const spaceDir = getSpaceDir(slug);
    const allDocFiles = await walkDocs(spaceDir);
    const linkedDocRe = /<!--\s*linked-doc:([A-Za-z0-9+/=]+)\s*-->/g;

    for (const filePath of allDocFiles) {
      let content: string;
      try {
        content = await fs.readFile(filePath, "utf-8");
      } catch {
        continue;
      }

      let fileChanged = false;
      const updated = content.replace(linkedDocRe, (_match, b64) => {
        try {
          const attrs = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
          if (
            attrs.docName === name &&
            attrs.docCategory === category &&
            attrs.spaceSlug === slug
          ) {
            attrs.docName = safeName;
            fileChanged = true;
            return `<!-- linked-doc:${Buffer.from(JSON.stringify(attrs)).toString("base64")} -->`;
          }
        } catch {
          // Malformed base64 — leave untouched
        }
        return _match;
      });

      if (fileChanged) {
        await fs.writeFile(filePath, updated, "utf-8");
      }
    }
  } catch {
    // Non-fatal
  }

  // ── 6. Update favorites in all user preferences ─────────────────────────
  try {
    const users = await getUsers();
    let anyChanged = false;
    for (const user of users) {
      if (!Array.isArray(user.preferences?.favorites)) continue;
      let userChanged = false;
      user.preferences!.favorites = (user.preferences!.favorites as FavoriteItem[]).map((fav) => {
        if (
          fav.type === "doc" &&
          fav.name === name &&
          fav.category === category &&
          fav.spaceSlug === slug
        ) {
          userChanged = true;
          return { ...fav, name: safeName };
        }
        return fav;
      });
      if (userChanged) anyChanged = true;
    }
    if (anyChanged) await writeUsers(users);
  } catch {
    // Non-fatal
  }

  invalidateSpaceCache(slug);
  auditLog(request, { event: "document.rename", outcome: "success", actor: renamer.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document", details: { newName: safeName } });
  return NextResponse.json({ success: true, name: safeName });
}
