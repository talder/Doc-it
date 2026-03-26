import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { listEnhancedTables, writeEnhancedTable, generateId } from "@/lib/enhanced-table";
import { invalidateSpaceCache } from "@/lib/space-cache";
import type { EnhancedTable, DbColumn, DbView } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const dbs = await listEnhancedTables(slug);
  // Return lightweight list (no rows) for perf
  return NextResponse.json(dbs.map(({ rows, ...rest }) => ({ ...rest, rowCount: rows.length })));
}

export async function POST(request: NextRequest, { params }: Params) {
  const { slug } = await params;
  let user;
  try { ({ user } = await requireSpaceRole(slug, "writer")); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const { title, columns: initialColumns, templateId } = await request.json();
  if (!title?.trim()) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const dbId = generateId();
  const now = new Date().toISOString();

  // Build initial columns from template or defaults
  let columns: DbColumn[];
  if (initialColumns && Array.isArray(initialColumns)) {
    columns = initialColumns.map((c: Partial<DbColumn>) => ({
      id: c.id || generateId(),
      name: c.name || "Column",
      type: c.type || "text",
      ...(c.options ? { options: c.options } : {}),
      ...(c.width ? { width: c.width } : {}),
    }));
  } else if (templateId) {
    columns = getTemplateColumns(templateId);
  } else {
    columns = [
      { id: generateId(), name: "Name", type: "text", width: 200 },
      { id: generateId(), name: "Status", type: "select", options: ["Todo", "In Progress", "Done"], width: 120 },
      { id: generateId(), name: "Notes", type: "text", width: 200 },
    ];
  }

  const defaultView: DbView = {
    id: generateId(),
    name: "Table View",
    type: "table",
    filters: [],
    sorts: [],
    columnOrder: columns.map((c) => c.id),
  };

  // Create 3 empty rows by default
  const emptyRows = Array.from({ length: 3 }, () => ({
    id: generateId(),
    cells: {} as Record<string, unknown>,
    createdAt: now,
  }));

  const db: EnhancedTable = {
    id: dbId,
    title: title.trim(),
    columns,
    rows: emptyRows,
    views: [defaultView],
    createdAt: now,
    createdBy: user.username,
    updatedAt: now,
  };

  await writeEnhancedTable(slug, dbId, db);
  invalidateSpaceCache(slug);
  return NextResponse.json(db, { status: 201 });
}

function getTemplateColumns(templateId: string): DbColumn[] {
  switch (templateId) {
    case "bug-tracker":
      return [
        { id: generateId(), name: "Title", type: "text", width: 220 },
        { id: generateId(), name: "Status", type: "select", options: ["Open", "In Progress", "Resolved", "Closed"], width: 120 },
        { id: generateId(), name: "Priority", type: "select", options: ["Critical", "High", "Medium", "Low"], width: 100 },
        { id: generateId(), name: "Assignee", type: "text", width: 120 },
        { id: generateId(), name: "Due Date", type: "date", width: 120 },
      ];
    case "meeting-notes":
      return [
        { id: generateId(), name: "Topic", type: "text", width: 220 },
        { id: generateId(), name: "Date", type: "date", width: 120 },
        { id: generateId(), name: "Attendees", type: "text", width: 160 },
        { id: generateId(), name: "Notes", type: "text", width: 240 },
        { id: generateId(), name: "Action Items", type: "text", width: 200 },
      ];
    case "project-tracker":
      return [
        { id: generateId(), name: "Task", type: "text", width: 220 },
        { id: generateId(), name: "Status", type: "select", options: ["Not Started", "In Progress", "Blocked", "Complete"], width: 120 },
        { id: generateId(), name: "Owner", type: "text", width: 120 },
        { id: generateId(), name: "Start Date", type: "date", width: 110 },
        { id: generateId(), name: "End Date", type: "date", width: 110 },
        { id: generateId(), name: "Progress", type: "number", width: 80 },
      ];
    case "content-calendar":
      return [
        { id: generateId(), name: "Title", type: "text", width: 220 },
        { id: generateId(), name: "Status", type: "select", options: ["Idea", "Drafting", "Review", "Published"], width: 120 },
        { id: generateId(), name: "Author", type: "text", width: 120 },
        { id: generateId(), name: "Publish Date", type: "date", width: 120 },
        { id: generateId(), name: "Channel", type: "select", options: ["Blog", "Social", "Newsletter", "Docs"], width: 110 },
      ];
    default:
      return [
        { id: generateId(), name: "Name", type: "text", width: 200 },
        { id: generateId(), name: "Status", type: "select", options: ["Todo", "In Progress", "Done"], width: 120 },
        { id: generateId(), name: "Notes", type: "text", width: 200 },
      ];
  }
}
