import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { queryAuditLogs } from "@/lib/audit";

type Params = { params: Promise<{ slug: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try {
    await requireSpaceRole(slug, "reader");
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 403 });
  }

  // Fetch recent document events for this space
  const result = await queryAuditLogs({
    spaceSlug: slug,
    pageSize: 200,
  });

  const seen = new Set<string>();
  const recentDocs: {
    name: string;
    category: string;
    action: "created" | "updated";
    actor: string;
    timestamp: string;
  }[] = [];

  for (const entry of result.entries) {
    if (
      entry.event !== "document.create" &&
      entry.event !== "document.update"
    )
      continue;

    // resource is "category/name"
    const key = entry.resource || "";
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const slashIdx = key.indexOf("/");
    const category = slashIdx > -1 ? key.slice(0, slashIdx) : "";
    const name = slashIdx > -1 ? key.slice(slashIdx + 1) : key;

    recentDocs.push({
      name,
      category,
      action: entry.event === "document.create" ? "created" : "updated",
      actor: entry.actor,
      timestamp: entry.timestamp,
    });

    if (recentDocs.length >= 10) break;
  }

  // Compute basic space stats
  let totalDocs = 0;
  let totalCreates = 0;
  let totalUpdates = 0;
  const uniqueEditors = new Set<string>();

  for (const entry of result.entries) {
    if (entry.event === "document.create") {
      totalCreates++;
      uniqueEditors.add(entry.actor);
    } else if (entry.event === "document.update") {
      totalUpdates++;
      uniqueEditors.add(entry.actor);
    }
  }
  totalDocs = totalCreates; // approximate: # of doc create events

  return NextResponse.json({
    recentDocs,
    stats: {
      totalCreates,
      totalUpdates,
      uniqueEditors: uniqueEditors.size,
    },
  });
}
