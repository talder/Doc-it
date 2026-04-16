import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { listEnhancedTablesMeta, writeEnhancedTable, generateId } from "@/lib/enhanced-table";
import { invalidateSpaceCache } from "@/lib/space-cache";
import type { EnhancedTable, DbColumn, DbView } from "@/lib/types";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { slug } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  try {
    const dbs = await listEnhancedTablesMeta(slug);
    return NextResponse.json(dbs);
  } catch (err) {
    return NextResponse.json({ error: `Failed to list enhanced tables: ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
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
  let templateRows: Record<string, unknown>[] = [];
  if (initialColumns && Array.isArray(initialColumns)) {
    columns = initialColumns.map((c: Partial<DbColumn>) => ({
      id: c.id || generateId(),
      name: c.name || "Column",
      type: c.type || "text",
      ...(c.options ? { options: c.options } : {}),
      ...(c.width ? { width: c.width } : {}),
    }));
  } else if (templateId) {
    const tpl = getTemplate(templateId);
    columns = tpl.columns;
    templateRows = tpl.sampleRows;
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

  // Use template sample rows or create 3 empty rows
  const dbRows = templateRows.length > 0
    ? templateRows.map((cells) => ({ id: generateId(), cells, createdAt: now }))
    : Array.from({ length: 3 }, () => ({ id: generateId(), cells: {} as Record<string, unknown>, createdAt: now }));

  const db: EnhancedTable = {
    id: dbId,
    title: title.trim(),
    columns,
    rows: dbRows,
    views: [defaultView],
    createdAt: now,
    createdBy: user.username,
    updatedAt: now,
  };

  await writeEnhancedTable(slug, dbId, db);
  invalidateSpaceCache(slug);
  return NextResponse.json(db, { status: 201 });
}

function getTemplate(templateId: string): { columns: DbColumn[]; sampleRows: Record<string, unknown>[] } {
  // Generate column IDs first so we can reference them in sample data
  const ids = Array.from({ length: 8 }, () => generateId());

  switch (templateId) {
    case "bug-tracker": {
      const cols: DbColumn[] = [
        { id: ids[0], name: "Title", type: "text", width: 220 },
        { id: ids[1], name: "Status", type: "select", options: ["Open", "In Progress", "Resolved", "Closed"], width: 120 },
        { id: ids[2], name: "Priority", type: "select", options: ["Critical", "High", "Medium", "Low"], width: 100 },
        { id: ids[3], name: "Assignee", type: "text", width: 120 },
        { id: ids[4], name: "Due Date", type: "date", width: 120 },
      ];
      return { columns: cols, sampleRows: [
        { [ids[0]]: "Login page crashes on mobile", [ids[1]]: "Open", [ids[2]]: "Critical", [ids[3]]: "Alice", [ids[4]]: "2026-04-20" },
        { [ids[0]]: "Dark mode toggle not persisting", [ids[1]]: "In Progress", [ids[2]]: "Medium", [ids[3]]: "Bob", [ids[4]]: "2026-04-25" },
        { [ids[0]]: "Export CSV missing headers", [ids[1]]: "Open", [ids[2]]: "Low", [ids[3]]: "", [ids[4]]: "" },
        { [ids[0]]: "Search results not highlighting", [ids[1]]: "Resolved", [ids[2]]: "Medium", [ids[3]]: "Charlie", [ids[4]]: "2026-04-15" },
      ]};
    }
    case "meeting-notes": {
      const cols: DbColumn[] = [
        { id: ids[0], name: "Topic", type: "text", width: 220 },
        { id: ids[1], name: "Date", type: "date", width: 120 },
        { id: ids[2], name: "Attendees", type: "text", width: 160 },
        { id: ids[3], name: "Notes", type: "text", width: 240 },
        { id: ids[4], name: "Action Items", type: "text", width: 200 },
      ];
      return { columns: cols, sampleRows: [
        { [ids[0]]: "Sprint planning", [ids[1]]: "2026-04-14", [ids[2]]: "Team", [ids[3]]: "Reviewed backlog, assigned stories", [ids[4]]: "Update Jira board" },
        { [ids[0]]: "Design review", [ids[1]]: "2026-04-15", [ids[2]]: "Alice, Bob", [ids[3]]: "Approved new dashboard mockups", [ids[4]]: "Start implementation" },
        { [ids[0]]: "Retrospective", [ids[1]]: "2026-04-16", [ids[2]]: "Team", [ids[3]]: "Good: velocity up. Improve: testing", [ids[4]]: "Add test coverage target" },
      ]};
    }
    case "project-tracker": {
      const cols: DbColumn[] = [
        { id: ids[0], name: "Task", type: "text", width: 220 },
        { id: ids[1], name: "Status", type: "select", options: ["Not Started", "In Progress", "Blocked", "Complete"], width: 120 },
        { id: ids[2], name: "Owner", type: "text", width: 120 },
        { id: ids[3], name: "Start Date", type: "date", width: 110 },
        { id: ids[4], name: "End Date", type: "date", width: 110 },
        { id: ids[5], name: "Progress", type: "number", width: 80 },
      ];
      return { columns: cols, sampleRows: [
        { [ids[0]]: "Requirements gathering", [ids[1]]: "Complete", [ids[2]]: "Alice", [ids[3]]: "2026-04-01", [ids[4]]: "2026-04-05", [ids[5]]: 100 },
        { [ids[0]]: "Backend API development", [ids[1]]: "In Progress", [ids[2]]: "Bob", [ids[3]]: "2026-04-06", [ids[4]]: "2026-04-20", [ids[5]]: 60 },
        { [ids[0]]: "Frontend implementation", [ids[1]]: "In Progress", [ids[2]]: "Charlie", [ids[3]]: "2026-04-10", [ids[4]]: "2026-04-25", [ids[5]]: 30 },
        { [ids[0]]: "Testing & QA", [ids[1]]: "Not Started", [ids[2]]: "Diana", [ids[3]]: "2026-04-26", [ids[4]]: "2026-04-30", [ids[5]]: 0 },
      ]};
    }
    case "content-calendar": {
      const cols: DbColumn[] = [
        { id: ids[0], name: "Title", type: "text", width: 220 },
        { id: ids[1], name: "Status", type: "select", options: ["Idea", "Drafting", "Review", "Published"], width: 120 },
        { id: ids[2], name: "Author", type: "text", width: 120 },
        { id: ids[3], name: "Publish Date", type: "date", width: 120 },
        { id: ids[4], name: "Channel", type: "select", options: ["Blog", "Social", "Newsletter", "Docs"], width: 110 },
      ];
      return { columns: cols, sampleRows: [
        { [ids[0]]: "Getting started guide", [ids[1]]: "Published", [ids[2]]: "Alice", [ids[3]]: "2026-04-10", [ids[4]]: "Blog" },
        { [ids[0]]: "New feature announcement", [ids[1]]: "Drafting", [ids[2]]: "Bob", [ids[3]]: "2026-04-18", [ids[4]]: "Newsletter" },
        { [ids[0]]: "Tips & tricks video", [ids[1]]: "Idea", [ids[2]]: "", [ids[3]]: "", [ids[4]]: "Social" },
      ]};
    }
    case "contact-list": {
      const cols: DbColumn[] = [
        { id: ids[0], name: "Name", type: "text", width: 180 },
        { id: ids[1], name: "Email", type: "email", width: 200 },
        { id: ids[2], name: "Company", type: "text", width: 150 },
        { id: ids[3], name: "Phone", type: "text", width: 140 },
        { id: ids[4], name: "Role", type: "text", width: 120 },
      ];
      return { columns: cols, sampleRows: [
        { [ids[0]]: "John Smith", [ids[1]]: "john@example.com", [ids[2]]: "Acme Corp", [ids[3]]: "+32 499 123 456", [ids[4]]: "Manager" },
        { [ids[0]]: "Jane Doe", [ids[1]]: "jane@example.com", [ids[2]]: "TechCo", [ids[3]]: "+32 499 789 012", [ids[4]]: "Engineer" },
        { [ids[0]]: "Bob Wilson", [ids[1]]: "bob@example.com", [ids[2]]: "StartupXYZ", [ids[3]]: "+32 499 345 678", [ids[4]]: "CTO" },
      ]};
    }
    default: {
      const cols: DbColumn[] = [
        { id: ids[0], name: "Name", type: "text", width: 200 },
        { id: ids[1], name: "Status", type: "select", options: ["Todo", "In Progress", "Done"], width: 120 },
        { id: ids[2], name: "Notes", type: "text", width: 200 },
      ];
      return { columns: cols, sampleRows: [] };
    }
  }
}
