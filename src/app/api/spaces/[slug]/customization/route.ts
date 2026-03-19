import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readCustomization, writeCustomization } from "@/lib/config";
import { invalidateSpaceCache } from "@/lib/space-cache";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const data = await readCustomization(slug);
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "writer");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const body = await request.json();
  const current = await readCustomization(slug);

  // Merge doc icons
  if (body.docIcons && typeof body.docIcons === "object") {
    for (const [key, val] of Object.entries(body.docIcons)) {
      if (val) {
        current.docIcons[key] = val as string;
      } else {
        delete current.docIcons[key];
      }
    }
  }

  // Merge doc colors
  if (body.docColors && typeof body.docColors === "object") {
    for (const [key, val] of Object.entries(body.docColors)) {
      if (val) {
        current.docColors[key] = val as string;
      } else {
        delete current.docColors[key];
      }
    }
  }

  // Merge category icons
  if (body.categoryIcons && typeof body.categoryIcons === "object") {
    for (const [key, val] of Object.entries(body.categoryIcons)) {
      if (val) {
        current.categoryIcons[key] = val as string;
      } else {
        delete current.categoryIcons[key];
      }
    }
  }

  // Merge category colors
  if (body.categoryColors && typeof body.categoryColors === "object") {
    for (const [key, val] of Object.entries(body.categoryColors)) {
      if (val) {
        current.categoryColors[key] = val as string;
      } else {
        delete current.categoryColors[key];
      }
    }
  }

  // Merge tag colors
  if (body.tagColors && typeof body.tagColors === "object") {
    for (const [key, val] of Object.entries(body.tagColors)) {
      if (val) {
        current.tagColors[key] = val as string;
      } else {
        delete current.tagColors[key];
      }
    }
  }

  await writeCustomization(slug, current);
  invalidateSpaceCache(slug);
  return NextResponse.json(current);
}
