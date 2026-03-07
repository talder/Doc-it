import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getCurrentUser } from "@/lib/auth";
import { getAccessibleSpaces, getSpaces } from "@/lib/permissions";
import { writeJsonConfig, ensureDir, getSpaceDir } from "@/lib/config";
import type { Space } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const spaces = await getAccessibleSpaces(user);
  return NextResponse.json(spaces);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const { name } = await request.json();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const spaces = await getSpaces();
  if (spaces.find((s) => s.slug === slug)) {
    return NextResponse.json({ error: "Space with this name already exists" }, { status: 409 });
  }

  const newSpace: Space = {
    id: randomUUID(),
    name,
    slug: slug || "space-" + randomUUID().slice(0, 8),
    createdBy: user.username,
    createdAt: new Date().toISOString(),
    permissions: { [user.username]: "admin" },
  };

  spaces.push(newSpace);
  await writeJsonConfig("spaces.json", spaces);

  // Create space dir with default General category
  const generalDir = `${getSpaceDir(newSpace.slug)}/General`;
  await ensureDir(generalDir);

  return NextResponse.json(newSpace, { status: 201 });
}
