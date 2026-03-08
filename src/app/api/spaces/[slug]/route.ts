import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSpaces, getUserSpaceRole, isSpaceAdmin } from "@/lib/permissions";
import { writeJsonConfig } from "@/lib/config";
import { auditLog } from "@/lib/audit";
import type { SpaceRole } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const spaces = await getSpaces();
  const space = spaces.find((s) => s.slug === slug);
  if (!space) return NextResponse.json({ error: "Space not found" }, { status: 404 });

  const role = getUserSpaceRole(space, user);
  if (!role) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  return NextResponse.json(space);
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const spaces = await getSpaces();
  const spaceIndex = spaces.findIndex((s) => s.slug === slug);
  if (spaceIndex === -1) return NextResponse.json({ error: "Space not found" }, { status: 404 });

  const role = getUserSpaceRole(spaces[spaceIndex], user);
  if (!isSpaceAdmin(role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { name, permissions } = await request.json();
  if (name) spaces[spaceIndex].name = name;
  if (permissions) {
    // Validate permissions
    const validRoles: SpaceRole[] = ["admin", "writer", "reader"];
    for (const role of Object.values(permissions)) {
      if (!validRoles.includes(role as SpaceRole)) {
        return NextResponse.json({ error: "Invalid role" }, { status: 400 });
      }
    }
    spaces[spaceIndex].permissions = permissions;
  }

  await writeJsonConfig("spaces.json", spaces);
  const details: Record<string, unknown> = {};
  if (name) details.name = name;
  if (permissions) details.permissionsUpdated = true;
  auditLog(request, { event: "space.update", outcome: "success", actor: user.username, spaceSlug: slug, resource: slug, resourceType: "space", details });
  return NextResponse.json(spaces[spaceIndex]);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const spaces = await getSpaces();
  const filtered = spaces.filter((s) => s.slug !== slug);
  if (filtered.length === spaces.length) {
    return NextResponse.json({ error: "Space not found" }, { status: 404 });
  }

  await writeJsonConfig("spaces.json", filtered);

  auditLog(_req, { event: "space.delete", outcome: "success", actor: user.username, spaceSlug: slug, resource: slug, resourceType: "space" });
  // Optionally delete space directory (keeping files for safety)
  return NextResponse.json({ success: true });
}
