import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

/** GET /api/mirth/check — returns { allowed: true } for any authenticated user. */
export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ allowed: !!user });
}
