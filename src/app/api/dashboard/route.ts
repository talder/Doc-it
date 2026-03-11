import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readDashboard, writeDashboard } from "@/lib/dashboard";
import { getUserGroupsForUser } from "@/lib/user-groups";
import { getDashboardRole } from "@/lib/dashboard-access";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const role = await getDashboardRole(user);

  // Users without dashboard access get an empty response
  if (role === "none") {
    return NextResponse.json({ sections: [], links: [], canEdit: false });
  }

  const data = await readDashboard();
  const canEdit = role === "admin";

  // Admins see everything
  if (canEdit) return NextResponse.json({ ...data, canEdit: true });

  // Viewers: filter links by user group membership
  const userGroupIds = await getUserGroupsForUser(user.username);
  const visibleLinks = data.links.filter((link) => {
    if (link.visibleToGroups.length === 0) return true; // visible to everyone
    return link.visibleToGroups.some((gid) => userGroupIds.includes(gid));
  });

  // Only include sections that have at least one visible link
  const usedSectionIds = new Set(visibleLinks.map((l) => l.sectionId));
  const visibleSections = data.sections.filter((s) => usedSectionIds.has(s.id));

  return NextResponse.json({ sections: visibleSections, links: visibleLinks, canEdit: false });
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
