import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole, getSpaces } from "@/lib/permissions";
import { getCurrentUser, getUsers } from "@/lib/auth";
import { readDocStatusMap, writeDocStatusMap } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import { sendMail } from "@/lib/email";
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

  // Notify the reviewer by email (fire-and-forget)
  if (status === "review" && reviewer) {
    (async () => {
      try {
        const [users, spaces] = await Promise.all([getUsers(), getSpaces()]);
        const reviewerUser = users.find((u) => u.username === reviewer);
        if (!reviewerUser?.email) return;
        const spaceName = spaces.find((s) => s.slug === slug)?.name ?? slug;
        await sendMail(
          reviewerUser.email,
          `[Doc-it] You have been asked to review "${name}"`,
          `<p><strong>${user.username}</strong> has requested your review on a document.</p>
           <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
             <tr><td style="padding:4px 12px;font-weight:bold">Document</td><td style="padding:4px 12px">${name}</td></tr>
             <tr><td style="padding:4px 12px;font-weight:bold">Category</td><td style="padding:4px 12px">${category || "—"}</td></tr>
             <tr><td style="padding:4px 12px;font-weight:bold">Space</td><td style="padding:4px 12px">${spaceName}</td></tr>
             <tr><td style="padding:4px 12px;font-weight:bold">Requested by</td><td style="padding:4px 12px">${user.username}</td></tr>
           </table>
           <p style="margin-top:16px">Log in to Doc-it to review the document.</p>
           <p style="color:#888;font-size:12px">This is an automated notification from your Doc-it instance.</p>`
        );
      } catch {
        // fire-and-forget — never block the response
      }
    })();
  }

  return NextResponse.json(map[key]);
}
