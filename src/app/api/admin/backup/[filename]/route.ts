import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { deleteBackup } from "@/lib/backup";

type Params = { params: Promise<{ filename: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user?.isAdmin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { filename } = await params;
  const deleted = await deleteBackup(decodeURIComponent(filename));
  if (!deleted) return NextResponse.json({ error: "File not found or invalid filename" }, { status: 404 });
  return NextResponse.json({ success: true });
}
