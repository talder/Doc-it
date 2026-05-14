import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readCmdb, searchCmdbItems } from "@/lib/cmdb";
import { readTickets } from "@/lib/helpdesk";

/**
 * GET /api/helpdesk/assets?q=&limit=
 * Search CMDB assets for the ticket asset picker.
 * Also supports ?ticketsFor=<assetId> to reverse-lookup tickets referencing a CI.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = request.nextUrl.searchParams;

  // Reverse lookup: which tickets reference a given CMDB CI?
  const ticketsFor = sp.get("ticketsFor");
  if (ticketsFor) {
    const data = await readTickets();
    const related = data.tickets.filter(
      (t) =>
        t.assetId === ticketsFor ||
        (t.affectedAssetIds || []).includes(ticketsFor),
    );
    return NextResponse.json({
      tickets: related.map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        createdAt: t.createdAt,
      })),
    });
  }

  // Search / browse CMDB assets
  const q = (sp.get("q") || "").trim();
  const limit = Math.min(Number(sp.get("limit") || 25), 100);
  const cmdb = await readCmdb();

  const matches = q.length >= 2
    ? searchCmdbItems(cmdb.assets, q)
    : cmdb.assets;

  const items = matches.slice(0, limit).map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    typeId: a.typeId,
    status: a.status,
    ipAddresses: a.ipAddresses,
    location: a.location,
    owner: a.owner,
  }));

  return NextResponse.json({ assets: items, total: matches.length });
}
