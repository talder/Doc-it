import { NextResponse } from "next/server";
import { requireSpaceRole, getSpaces } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { readDocStatusMap } from "@/lib/config";
import type { ReviewItem } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.json([], { status: 200 });

  const spaces = await getSpaces();
  const space = spaces.find((s) => s.slug === slug);
  const spaceName = space?.name;

  const map = await readDocStatusMap(slug);
  const reviews: ReviewItem[] = [];

  for (const [key, entry] of Object.entries(map)) {
    if (entry.status === "review" && entry.reviewer === user.username) {
      // key format: "{category}/{docname}"
      const lastSlash = key.lastIndexOf("/");
      const category = lastSlash >= 0 ? key.slice(0, lastSlash) : "";
      const docName   = lastSlash >= 0 ? key.slice(lastSlash + 1) : key;
      reviews.push({
        docName,
        category,
        spaceSlug: slug,
        spaceName,
        assignedBy: entry.assignedBy,
        assignedAt: entry.assignedAt,
      });
    }
  }

  return NextResponse.json(reviews);
}
