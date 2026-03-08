import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readDatabase, writeDatabase, generateId } from "@/lib/database";
import type { DbRow } from "@/lib/types";

type Params = { params: Promise<{ slug: string; dbId: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readDatabase(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });
  return NextResponse.json(db.rows);
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "writer"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readDatabase(slug, dbId);
  if (!db) return NextResponse.json({ error: "Database not found" }, { status: 404 });

  const { cells } = await request.json();
  const row: DbRow = {
    id: generateId(),
    cells: cells || {},
    createdAt: new Date().toISOString(),
  };

  db.rows.push(row);
  db.updatedAt = new Date().toISOString();
  await writeDatabase(slug, dbId, db);
  return NextResponse.json(row, { status: 201 });
}
