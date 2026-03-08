import { NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { getUsers } from "@/lib/auth";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;

  let space: import("@/lib/types").Space;
  try {
    const result = await requireSpaceRole(slug, "reader");
    space = result.space;
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  const allUsers = await getUsers();

  // Only include users who can write (writer/admin role) — readers cannot be assigned as reviewers
  const members = allUsers
    .filter((u) => {
      if (u.isAdmin) return true;
      const role = space.permissions[u.username];
      return role === "writer" || role === "admin";
    })
    .map((u) => ({ username: u.username, fullName: u.fullName }));

  return NextResponse.json(members);
}
