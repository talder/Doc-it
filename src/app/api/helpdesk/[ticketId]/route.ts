import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTicket, addComment } from "@/lib/helpdesk";
import type { TicketAttachment } from "@/lib/helpdesk";

type Params = { params: Promise<{ ticketId: string }> };

/** GET /api/helpdesk/[ticketId] — get single ticket */
export async function GET(_request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const ticket = await getTicket(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  return NextResponse.json({ ticket });
}

/** POST /api/helpdesk/[ticketId] — add comment */
export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const body = await request.json();
  const { content, isInternal, attachments } = body;

  if (!content?.trim()) return NextResponse.json({ error: "Content is required" }, { status: 400 });

  const comment = await addComment(ticketId, {
    author: user.username,
    authorType: "agent",
    content: content.trim(),
    isInternal: !!isInternal,
    attachments: (attachments || []) as TicketAttachment[],
  });

  if (!comment) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  return NextResponse.json({ comment });
}
