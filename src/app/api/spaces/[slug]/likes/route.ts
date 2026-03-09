import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readJsonConfig, writeJsonConfig } from "@/lib/config";

type Params = { params: Promise<{ slug: string }> };

type LikesMap = Record<string, Record<string, string>>; // "category/docName" -> { username: ISO-date }

function getLikesFile(slug: string) {
  return `spaces/${slug}/likes.json`;
}

/** GET — return likes map for the space (or for a specific doc via ?doc= query) */
export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const likes = await readJsonConfig<LikesMap>(getLikesFile(slug), {});

  const doc = request.nextUrl.searchParams.get("doc");
  if (doc) {
    const docLikes = likes[doc] || {};
    return NextResponse.json({ doc, likes: docLikes, count: Object.keys(docLikes).length });
  }

  return NextResponse.json({ likes });
}

/** POST — toggle like for a doc. Body: { doc: "category/docName" } */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try { ({ user } = await requireSpaceRole(slug, "reader")); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const { doc } = await request.json();
  if (!doc || typeof doc !== "string") {
    return NextResponse.json({ error: "doc field required" }, { status: 400 });
  }

  const likes = await readJsonConfig<LikesMap>(getLikesFile(slug), {});
  if (!likes[doc]) likes[doc] = {};

  let liked: boolean;
  if (likes[doc][user.username]) {
    delete likes[doc][user.username];
    liked = false;
  } else {
    likes[doc][user.username] = new Date().toISOString();
    liked = true;
  }

  await writeJsonConfig(getLikesFile(slug), likes);

  return NextResponse.json({
    doc,
    liked,
    count: Object.keys(likes[doc]).length,
  });
}
