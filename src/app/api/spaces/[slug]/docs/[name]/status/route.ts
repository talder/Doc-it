import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { readDocStatusMap, writeDocStatusMap } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import type { DocStatus } from "@/lib/types";

type Params = { params: Promise<{ slug: string; name: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;
  const category = request.nextUrl.searchParams.get("category") || "";

  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const map = await readDocStatusMap(slug);
  const key = `${category}/${name}`;
  const entry = map[key] ?? { status: "draft" as DocStatus };
  return NextResponse.json(entry);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug, name } = await params;

  // Try writer access; fall back to reader if the user is the assigned reviewer
  let isWriter = false;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  try {
    await requireSpaceRole(slug, "writer");
    isWriter = true;
  } catch {
    // Verify at least reader access
    try {
      await requireSpaceRole(slug, "reader");
    } catch (err) {
      return NextResponse.json({ error: String(err) }, { status: 403 });
    }
  }

  const { category, status, reviewer } = await request.json() as {
    category: string;
    status: DocStatus;
    reviewer?: string;
  };

  if (!["draft", "review", "published"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const map = await readDocStatusMap(slug);
  const key = `${category}/${name}`;

  // Readers may only update status when they are the assigned reviewer of this specific doc.
  // They cannot (re-)assign a reviewer — that requires writer access.
  if (!isWriter) {
    const existing = map[key];
    if (!existing || existing.reviewer !== user.username) {
      return NextResponse.json({ error: "Write access required" }, { status: 403 });
    }
    // Reviewers cannot set a new reviewer assignment (only writers can do that)
    if (status === "review") {
      return NextResponse.json({ error: "Assigning reviewers requires write access" }, { status: 403 });
    }
  }

  map[key] = {
    status,
    ...(status === "review" && reviewer
      ? { reviewer, assignedBy: user.username, assignedAt: new Date().toISOString() }
      : {}),
    // clear reviewer fields if moving away from review
    ...(status !== "review" ? { reviewer: undefined, assignedBy: undefined, assignedAt: undefined } : {}),
  };
  // Clean up undefined fields
  if (map[key].reviewer === undefined) delete map[key].reviewer;
  if (map[key].assignedBy === undefined) delete map[key].assignedBy;
  if (map[key].assignedAt === undefined) delete map[key].assignedAt;

  await writeDocStatusMap(slug, map);
  auditLog(request, { event: "document.status.change", outcome: "success", actor: user.username, spaceSlug: slug, resource: `${category}/${name}`, resourceType: "document", details: { status, reviewer } });
  return NextResponse.json(map[key]);
}
