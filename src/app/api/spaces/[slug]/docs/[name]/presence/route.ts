import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { join, leave, heartbeat, makeDocKey } from "@/lib/presence";

type Params = { params: Promise<{ slug: string; name: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug, name } = await params;
  const { category, action } = await request.json();

  if (!category || !["join", "leave", "heartbeat"].includes(action)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const docKey = makeDocKey(slug, category, name);
  let editors: string[];

  switch (action) {
    case "join":
      editors = join(docKey, user.username);
      break;
    case "leave":
      editors = leave(docKey, user.username);
      break;
    case "heartbeat":
      editors = heartbeat(docKey, user.username);
      break;
    default:
      editors = [];
  }

  return NextResponse.json({ editors });
}
