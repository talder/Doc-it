import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readTickets, filterTickets, ticketsToCsv, importTicketsFromCsv } from "@/lib/helpdesk";

/** GET /api/helpdesk/import-export — CSV export of tickets */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const data = await readTickets();

  const tickets = filterTickets(data.tickets, {
    q: sp.get("q") || undefined,
    status: sp.get("status") || undefined,
    priority: sp.get("priority") || undefined,
    ticketType: sp.get("ticketType") || undefined,
    assignedTo: sp.get("assignedTo") || undefined,
    assignedGroup: sp.get("assignedGroup") || undefined,
    category: sp.get("category") || undefined,
    requester: sp.get("requester") || undefined,
    tag: sp.get("tag") || undefined,
  });

  const csv = ticketsToCsv(tickets);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="helpdesk-tickets-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

/** POST /api/helpdesk/import-export — CSV import of tickets */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const contentType = request.headers.get("content-type") || "";
  let csv: string;

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file field required" }, { status: 400 });
    }
    csv = await (file as Blob).text();
  } else {
    const body = await request.json();
    csv = body.csv;
    if (!csv) return NextResponse.json({ error: "csv field required" }, { status: 400 });
  }

  const result = await importTicketsFromCsv(csv, user.username);
  return NextResponse.json(result);
}
