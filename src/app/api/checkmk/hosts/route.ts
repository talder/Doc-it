import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { searchCheckmkHosts, getCheckmkHost } from "@/lib/checkmk";

/** GET /api/checkmk/hosts?query=&serverId=&hostName= */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const hostName = searchParams.get("hostName");
  const query = searchParams.get("query") ?? undefined;
  const serverId = searchParams.get("serverId") ?? undefined;

  if (hostName) {
    const host = await getCheckmkHost(hostName, serverId);
    if (!host) return NextResponse.json({ error: "Host not found" }, { status: 404 });
    return NextResponse.json({ host });
  }

  const hosts = await searchCheckmkHosts(query, serverId);
  return NextResponse.json({ hosts });
}
