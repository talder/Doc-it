import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DocItBot/1.0; +https://doc-it)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    });

    if (!res.ok) {
      return NextResponse.json({ url, title: parsed.hostname }, { status: 200 });
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) {
      return NextResponse.json({ url, title: parsed.hostname }, { status: 200 });
    }

    const html = await res.text();

    const getOg = (prop: string): string => {
      const m =
        html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, "i")) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, "i"));
      return m?.[1] ?? "";
    };

    const getMeta = (name: string): string => {
      const m =
        html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, "i")) ||
        html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, "i"));
      return m?.[1] ?? "";
    };

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const rawTitle = getOg("title") || getMeta("title") || titleMatch?.[1] || parsed.hostname;
    const title = rawTitle.trim().replace(/&amp;/g, "&").replace(/&#039;/g, "'").replace(/&quot;/g, '"');

    const description =
      (getOg("description") || getMeta("description") || "")
        .trim()
        .replace(/&amp;/g, "&")
        .replace(/&#039;/g, "'")
        .replace(/&quot;/g, '"');

    const image = getOg("image") || "";

    // Resolve favicon: try /favicon.ico as fallback
    const faviconLinkMatch = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
    let favicon = faviconLinkMatch?.[1] || "";
    if (favicon && !favicon.startsWith("http")) {
      favicon = new URL(favicon, parsed.origin).toString();
    }
    if (!favicon) favicon = `${parsed.origin}/favicon.ico`;

    return NextResponse.json({ url, title, description, image, favicon });
  } catch {
    return NextResponse.json({ url, title: parsed.hostname }, { status: 200 });
  }
}
