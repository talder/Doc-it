import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getSpaceDir, getCategoryDir } from "@/lib/config";
import { fromSafeB64 } from "@/lib/base64";
import type { TplField, TemplateInfo } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

/** Extract unique TplField objects from .mdt content by scanning data-tpl-field attributes. */
function extractFields(content: string): TplField[] {
  const fields: TplField[] = [];
  const seen = new Set<string>();
  const regex = /data-tpl-field="([A-Za-z0-9+/=]+)"/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    try {
      const field = fromSafeB64(match[1]) as TplField;
      if (field?.name && !seen.has(field.name)) {
        seen.add(field.name);
        fields.push(field);
      }
    } catch { /* skip malformed */ }
  }
  return fields;
}

async function scanTemplates(
  dir: string,
  space: string,
  categoryPath = ""
): Promise<TemplateInfo[]> {
  const templates: TemplateInfo[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return templates;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".mdt")) {
      const name = entry.name.replace(/\.mdt$/, "");
      try {
        const content = await fs.readFile(path.join(dir, entry.name), "utf-8");
        const fields = extractFields(content);
        templates.push({ name, filename: entry.name, category: categoryPath, space, fields });
      } catch { /* skip unreadable */ }
    } else if (entry.isDirectory() && !["attachments", ".git", ".DS_Store"].includes(entry.name)) {
      const subPath = categoryPath ? `${categoryPath}/${entry.name}` : entry.name;
      const sub = await scanTemplates(path.join(dir, entry.name), space, subPath);
      templates.push(...sub);
    }
  }
  return templates;
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const spaceDir = getSpaceDir(slug);
  const templates = await scanTemplates(spaceDir, slug);
  return NextResponse.json(templates);
}
