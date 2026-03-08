import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { requireSpaceRole } from "@/lib/permissions";
import { getCategoryDir, ensureDir } from "@/lib/config";

type Params = { params: Promise<{ slug: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!file.name.endsWith(".mdt")) {
    return NextResponse.json({ error: "Only .mdt files can be imported" }, { status: 400 });
  }

  const content = await file.text();
  const safeName = file.name
    .replace(/\.mdt$/, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim();
  if (!safeName) return NextResponse.json({ error: "Invalid file name" }, { status: 400 });

  const category = "Templates";
  const catDir = getCategoryDir(slug, category);
  await ensureDir(catDir);

  const filePath = path.join(catDir, `${safeName}.mdt`);
  await fs.writeFile(filePath, content, "utf-8");

  return NextResponse.json(
    { name: safeName, filename: `${safeName}.mdt`, category, space: slug, isTemplate: true },
    { status: 201 }
  );
}
