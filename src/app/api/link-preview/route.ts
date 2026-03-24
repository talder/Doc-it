import { NextRequest, NextResponse } from "next/server";
import dns from "dns/promises";
import net from "net";

function isPrivateOrLoopback(ip: string): boolean {
  // IPv6 loopback
  if (ip === "::1") return true;
  // IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (ip.startsWith("::ffff:")) {
    ip = ip.substring("::ffff:".length);
  }
  if (net.isIPv4(ip)) {
    const octets = ip.split(".").map(Number);
    const [o1, o2] = octets;
    // 10.0.0.0/8
    if (o1 === 10) return true;
    // 127.0.0.0/8
    if (o1 === 127) return true;
    // 172.16.0.0/12
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.168.0.0/16
    if (o1 === 192 && o2 === 168) return true;
    // Link-local 169.254.0.0/16
    if (o1 === 169 && o2 === 254) return true;
  } else if (net.isIPv6(ip)) {
    // Unique local addresses fc00::/7 and link-local fe80::/10
    const lower = ip.toLowerCase();
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80:")) return true;
  }
  return false;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  // Basic URL validation
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("bad protocol");

    // SSRF protection: resolve hostname and block private/loopback IPs
    const addresses = await dns.lookup(parsed.hostname, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateOrLoopback(a.address))) {
      return NextResponse.json({ error: "Forbidden host" }, { status: 400 });
    }
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
