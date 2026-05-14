import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { suggestArticles, classifyTicket, predictSlaBreaches } from "@/lib/helpdesk-ai";
import type { SlaPrediction } from "@/lib/helpdesk-ai";
import { getTicket } from "@/lib/helpdesk";

/**
 * GET /api/helpdesk/predict — lightweight AI queries from UI
 *   ?q=...&type=suggest  → article suggestions + category classification
 *   ?ticketId=...        → SLA breach prediction for a single ticket
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const q = searchParams.get("q");
  const ticketId = searchParams.get("ticketId");
  const type = searchParams.get("type");

  // Article + category suggestions for ticket creation
  if (q && type === "suggest") {
    const [articles, classifications] = await Promise.all([
      suggestArticles(q, "", 3),
      classifyTicket(q, "", 1),
    ]);
    return NextResponse.json({
      articles: articles.map((a) => ({ title: a.title, slug: `${a.category}/${a.docName}`, score: a.score })),
      suggestedCategory: classifications[0]?.category || null,
    });
  }

  // SLA prediction for a single ticket
  if (ticketId) {
    const ticket = await getTicket(ticketId);
    if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
    if (["Resolved", "Closed"].includes(ticket.status)) {
      return NextResponse.json({ ticketId, responseBreachRisk: 0, resolutionBreachRisk: 0, estimatedResolutionMinutes: 0, factors: [] });
    }
    const predictions = await predictSlaBreaches();
    const pred: SlaPrediction | undefined = predictions.find((p) => p.ticketId === ticketId);
    return NextResponse.json({
      ticketId,
      responseBreachRisk: pred ? pred.breachProbability * 0.6 : 0,
      resolutionBreachRisk: pred?.breachProbability ?? 0,
      estimatedResolutionMinutes: pred?.predictedResolutionMinutes ?? 0,
      factors: pred ? [`Historical avg: ${pred.predictedResolutionMinutes}min`, `SLA target: ${pred.slaResolutionMinutes}min`, `Risk: ${pred.riskLevel}`] : [],
    });
  }

  return NextResponse.json({ error: "Provide ?q=...&type=suggest or ?ticketId=..." }, { status: 400 });
}

/** POST /api/helpdesk/predict — AI-powered predictions (structured) */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  switch (action) {
    case "suggestArticles": {
      const { subject, description } = body;
      if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 });
      const suggestions = await suggestArticles(subject, description || "");
      return NextResponse.json({ suggestions });
    }

    case "classifyTicket": {
      const { subject, description } = body;
      if (!subject) return NextResponse.json({ error: "subject required" }, { status: 400 });
      const classifications = await classifyTicket(subject, description || "");
      return NextResponse.json({ classifications });
    }

    case "predictBreaches": {
      const predictions = await predictSlaBreaches(body.filters);
      return NextResponse.json({ predictions });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
