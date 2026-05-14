import { NextRequest, NextResponse } from "next/server";
import { getTicket, updateTicket } from "@/lib/helpdesk";

/**
 * POST /api/helpdesk/csat — submit CSAT rating for a resolved ticket.
 * Body: { ticketId, rating (1-5), comment? }
 * No auth required (linked from email to requester).
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { ticketId, rating, comment } = body;

  if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  if (typeof rating !== "number" || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 });
  }

  const ticket = await getTicket(ticketId);
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  if (ticket.status !== "Resolved" && ticket.status !== "Closed") {
    return NextResponse.json({ error: "Ticket must be resolved or closed" }, { status: 400 });
  }

  if (ticket.csatRating !== undefined) {
    return NextResponse.json({ error: "Rating already submitted" }, { status: 409 });
  }

  await updateTicket(ticketId, {
    csatRating: rating,
    csatComment: comment?.trim() || undefined,
  }, "csat-survey");

  return NextResponse.json({ ok: true, ticketId, rating });
}
