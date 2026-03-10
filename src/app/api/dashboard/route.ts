import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readDashboard, writeDashboard } from "@/lib/dashboard";
import { getUserGroupsForUser } from "@/lib/user-groups";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const data = await readDashboard();

  // Admins see everything
  if (user.isAdmin) return NextResponse.json(data);

  // Non-admins: filter links by user group membership
  const userGroupIds = await getUserGroupsForUser(user.username);
  const visibleLinks = data.links.filter((link) => {
    if (link.visibleToGroups.length === 0) return true; // visible to everyone
    return link.visibleToGroups.some((gid) => userGroupIds.includes(gid));
  });

  // Only include sections that have at least one visible link
  const usedSectionIds = new Set(visibleLinks.map((l) => l.sectionId));
  const visibleSections = data.sections.filter((s) => usedSectionIds.has(s.id));

  return NextResponse.json({ sections: visibleSections, links: visibleLinks });
}

export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (!body.sections || !body.links) {
    return NextResponse.json({ error: "sections and links are required" }, { status: 400 });
  }

  await writeDashboard({ sections: body.sections, links: body.links });
  return NextResponse.json({ ok: true });
}
