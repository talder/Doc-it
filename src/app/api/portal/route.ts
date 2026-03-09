import { NextRequest, NextResponse } from "next/server";
import { registerPortalUser, loginPortalUser, getPortalUserFromToken, logoutPortalUser } from "@/lib/helpdesk-portal";
import { readTickets, filterTickets, createTicket, addComment, readConfig } from "@/lib/helpdesk";
import { cookies } from "next/headers";

const COOKIE = "hd-portal-session";

async function getUser(req: NextRequest) {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return getPortalUserFromToken(token);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  if (action === "me") {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ user: null }, { status: 401 });
    return NextResponse.json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
  }

  if (action === "tickets") {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const data = await readTickets();
    const tickets = filterTickets(data.tickets, { requester: user.email });
    return NextResponse.json({ tickets });
  }

  if (action === "config") {
    const cfg = await readConfig();
    return NextResponse.json({
      categories: cfg.categories,
      forms: cfg.forms,
      fieldDefs: cfg.fieldDefs,
      portalPages: cfg.portalPages.filter((p) => p.published !== false),
    });
  }

  if (action === "publishedPages") {
    const cfg = await readConfig();
    const published = cfg.portalPages.filter((p) => p.published);
    return NextResponse.json({ pages: published, categories: cfg.categories });
  }

  if (action === "page") {
    const slug = searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const cfg = await readConfig();
    const page = cfg.portalPages.find((p) => p.slug === slug && p.published);
    if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ page, categories: cfg.categories });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "register") {
    const { email, displayName, password } = body;
    if (!email || !password || !displayName) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const result = await registerPortalUser(email, displayName, password);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "login") {
    const { email, password } = body;
    if (!email || !password) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    const result = await loginPortalUser(email, password);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 401 });
    const jar = await cookies();
    jar.set(COOKIE, result.token!, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 24 * 3600 });
    return NextResponse.json({ ok: true, user: { id: result.user!.id, email: result.user!.email, displayName: result.user!.displayName } });
  }

  if (action === "logout") {
    const jar = await cookies();
    const token = jar.get(COOKIE)?.value;
    if (token) {
      await logoutPortalUser(token);
      jar.delete(COOKIE);
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "submitTicket") {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { subject, description, priority, category, customFields, formId, attachments } = body;
    if (!subject) return NextResponse.json({ error: "Subject required" }, { status: 400 });
    const ticket = await createTicket({
      subject, description: description || "", priority: priority || "Medium",
      category: category || "", requester: user.email, requesterEmail: user.email,
      requesterType: "portal", customFields: customFields || {}, tags: [],
      attachments: attachments || [], formId,
    });
    return NextResponse.json({ ok: true, ticket });
  }

  if (action === "addComment") {
    const user = await getUser(req);
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { ticketId, content, attachments: atts } = body;
    const comment = await addComment(ticketId, { author: user.email, authorType: "portal", content, isInternal: false, attachments: atts || [] });
    if (!comment) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    return NextResponse.json({ ok: true, comment });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
