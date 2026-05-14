import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { suggestArticles, classifyTicket, predictSlaBreaches } from "@/lib/helpdesk-ai";

/** POST /api/helpdesk/predict — AI-powered predictions */
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
