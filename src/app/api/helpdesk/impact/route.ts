import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getTicket, createTicket, readConfig, readTickets } from "@/lib/helpdesk";

/** POST /api/helpdesk/impact — asset impact cascade operations */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action } = body;

  switch (action) {
    /**
     * analyzeImpact: Given an asset ID, find downstream services/CIs
     * from CMDB relationships and return the impact chain.
     */
    case "analyzeImpact": {
      const { assetId } = body;
      if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 });

      try {
        const { readCmdb } = await import("@/lib/cmdb");
        const cmdb = await readCmdb();
        const relationships = cmdb.relationships || [];
        const relTypes = cmdb.relationshipTypes || [];
        const dependsOnTypeId = relTypes.find((r) => r.label === "Depends on")?.id || "rel-depends-on";
        const supportsTypeId = relTypes.find((r) => r.label === "Supports")?.id || "rel-supports";

        // Find downstream assets (assets that depend on this one)
        const downstream: string[] = [];
        const visited = new Set<string>();
        const queue = [assetId];

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current)) continue;
          visited.add(current);

          for (const rel of relationships) {
            // "depends_on" — source depends on target → if target is current, source is downstream
            if (rel.targetId === current && rel.typeId === dependsOnTypeId && !visited.has(rel.sourceId)) {
              downstream.push(rel.sourceId);
              queue.push(rel.sourceId);
            }
            // "supports" — source supports target → if source is current, target is downstream
            if (rel.sourceId === current && rel.typeId === supportsTypeId && !visited.has(rel.targetId)) {
              downstream.push(rel.targetId);
              queue.push(rel.targetId);
            }
          }
        }

        // Resolve asset names
        const assets = cmdb.assets || [];
        const impacted = downstream.map((id) => {
          const asset = assets.find((a) => a.id === id);
          return { id, name: asset?.name || id, type: asset?.type || "unknown" };
        });

        return NextResponse.json({ assetId, impactedAssets: impacted, totalImpacted: impacted.length });
      } catch {
        return NextResponse.json({ assetId, impactedAssets: [], totalImpacted: 0 });
      }
    }

    /**
     * cascadeIncidents: Given a ticket ID, auto-create child incidents
     * for all downstream impacted assets.
     */
    case "cascadeIncidents": {
      const { ticketId } = body;
      if (!ticketId) return NextResponse.json({ error: "ticketId required" }, { status: 400 });

      const ticket = await getTicket(ticketId);
      if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

      const assetId = ticket.assetId;
      if (!assetId) return NextResponse.json({ error: "Ticket has no associated asset" }, { status: 400 });

      try {
        const { readCmdb } = await import("@/lib/cmdb");
        const cmdb = await readCmdb();
        const relationships = cmdb.relationships || [];
        const assets = cmdb.assets || [];
        const relTypes = cmdb.relationshipTypes || [];
        const dependsOnTypeId = relTypes.find((r) => r.label === "Depends on")?.id || "rel-depends-on";
        const supportsTypeId = relTypes.find((r) => r.label === "Supports")?.id || "rel-supports";

        // Find downstream assets
        const downstream: string[] = [];
        const visited = new Set<string>();
        const queue = [assetId];

        while (queue.length > 0) {
          const current = queue.shift()!;
          if (visited.has(current)) continue;
          visited.add(current);

          for (const rel of relationships) {
            if (rel.targetId === current && rel.typeId === dependsOnTypeId && !visited.has(rel.sourceId)) {
              downstream.push(rel.sourceId);
              queue.push(rel.sourceId);
            }
            if (rel.sourceId === current && rel.typeId === supportsTypeId && !visited.has(rel.targetId)) {
              downstream.push(rel.targetId);
              queue.push(rel.targetId);
            }
          }
        }

        const created: string[] = [];
        for (const downId of downstream) {
          const ci = assets.find((c) => c.id === downId);
          const child = await createTicket({
            subject: `[Impact Cascade] ${ticket.subject} — ${ci?.name || downId}`,
            description: `Auto-created from parent ticket ${ticket.id} due to impact cascade.\n\nOriginal issue: ${ticket.description.slice(0, 500)}`,
            ticketType: "incident",
            priority: ticket.priority,
            impact: ticket.impact,
            urgency: ticket.urgency,
            category: ticket.category,
            assetId: downId,
            requester: user.username,
            requesterType: "agent",
            tags: ["impact-cascade", ticket.id],
          });
          created.push(child.id);
        }

        return NextResponse.json({ parentTicket: ticketId, createdTickets: created, count: created.length });
      } catch (err) {
        return NextResponse.json({ error: (err as Error).message }, { status: 500 });
      }
    }

    /**
     * checkContractLimits: Check if an organization has exceeded their
     * ticket limits under their support contract.
     */
    case "checkContractLimits": {
      const { orgId } = body;
      if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

      const cfg = await readConfig();
      const contract = (cfg.contracts || []).find((c) => c.orgId === orgId && c.active);
      if (!contract) return NextResponse.json({ contract: null, withinLimits: true });

      if (contract.maxTickets === 0) {
        return NextResponse.json({ contract, withinLimits: true, ticketCount: 0, remaining: "unlimited" });
      }

      // Count tickets within contract period
      const data = await readTickets();
      const orgTickets = data.tickets.filter((t) =>
        t.contractId === contract.id &&
        t.createdAt >= contract.startDate &&
        t.createdAt <= (contract.endDate || "9999-12-31"),
      );

      const remaining = contract.maxTickets - orgTickets.length;
      return NextResponse.json({
        contract,
        withinLimits: remaining > 0,
        ticketCount: orgTickets.length,
        remaining: Math.max(0, remaining),
      });
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
