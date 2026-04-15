import { NextRequest, NextResponse } from "next/server";
import { requireSpaceRole } from "@/lib/permissions";
import { readEnhancedTable } from "@/lib/enhanced-table";
import type { DbFilter, DbFilterOp, DbSort, DbColumn, DbRow } from "@/lib/types";

type Params = { params: Promise<{ slug: string; dbId: string }> };

// ── Helpers ────────────────────────────────────────────────────────────────────

function matchesFilter(row: DbRow, filter: DbFilter, columns: DbColumn[]): boolean {
  const col = columns.find((c) => c.id === filter.columnId);
  if (!col) return true;
  const raw = row.cells[col.id];
  const v = raw != null ? String(raw) : "";
  const fv = filter.value != null ? String(filter.value) : "";
  switch (filter.op) {
    case "eq": case "is": return v === fv;
    case "neq": case "isNot": return v !== fv;
    case "contains": return v.toLowerCase().includes(fv.toLowerCase());
    case "notContains": return !v.toLowerCase().includes(fv.toLowerCase());
    case "isEmpty": return v === "";
    case "isNotEmpty": return v !== "";
    case "gt": return Number(raw) > Number(filter.value);
    case "gte": return Number(raw) >= Number(filter.value);
    case "lt": return Number(raw) < Number(filter.value);
    case "lte": return Number(raw) <= Number(filter.value);
    case "before": return v < fv;
    case "after": return v > fv;
    case "isTrue": return !!raw;
    case "isFalse": return !raw;
    default: return true;
  }
}

function applyFilters(rows: DbRow[], filters: DbFilter[], columns: DbColumn[]): DbRow[] {
  if (!filters || filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => matchesFilter(row, f, columns)));
}

function applySorts<T extends { cells: Record<string, unknown>; _joined: Record<string, unknown> }>(rows: T[], sorts: DbSort[], columns: DbColumn[]): T[] {
  if (!sorts || sorts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      // Check both local and joined cells
      const av = a.cells[s.columnId] ?? a._joined[s.columnId];
      const bv = b.cells[s.columnId] ?? b._joined[s.columnId];
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (aEmpty && bEmpty) continue;
      const col = columns.find((c) => c.id === s.columnId);
      let cmp = 0;
      if (col?.type === "number") cmp = (Number(av) || 0) - (Number(bv) || 0);
      else cmp = String(av).localeCompare(String(bv));
      if (cmp !== 0) return s.dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

// ── Route ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/spaces/:slug/enhanced-tables/:dbId/join
 *
 * Performs a join across two tables via a relation column.
 * Returns source rows with merged target columns in a `_joined` map.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const { slug, dbId } = await params;
  try { await requireSpaceRole(slug, "reader"); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 403 }); }

  const db = await readEnhancedTable(slug, dbId);
  if (!db) return NextResponse.json({ error: "Source table not found" }, { status: 404 });

  const body = await request.json();
  const {
    targetDbId,
    relationColumnId,
    targetColumns,
    filters,
    targetFilters,
    sorts,
    limit,
  } = body as {
    targetDbId: string;
    relationColumnId: string;
    targetColumns?: string[];   // column names on target table
    filters?: DbFilter[];       // filters on source table
    targetFilters?: DbFilter[]; // filters on target table (applied to joined rows)
    sorts?: DbSort[];
    limit?: number;
  };

  if (!targetDbId || !relationColumnId) {
    return NextResponse.json({ error: "Missing targetDbId or relationColumnId" }, { status: 400 });
  }

  // Find the relation column
  const relCol = db.columns.find((c) => c.id === relationColumnId);
  if (!relCol?.relation) {
    return NextResponse.json({ error: "Column is not a relation" }, { status: 400 });
  }

  // Verify access to target space
  const { targetSpace, targetDbId: configTargetDbId } = relCol.relation;
  const effectiveTargetDbId = targetDbId || configTargetDbId;
  try { await requireSpaceRole(targetSpace, "reader"); }
  catch { return NextResponse.json({ error: "No access to target space" }, { status: 403 }); }

  const targetDb = await readEnhancedTable(targetSpace, effectiveTargetDbId);
  if (!targetDb) return NextResponse.json({ error: "Target table not found" }, { status: 404 });

  // Resolve target column IDs from names (case-insensitive)
  const targetColMap = new Map(targetDb.columns.map((c) => [c.name.toLowerCase(), c]));
  const resolvedTargetCols: DbColumn[] = targetColumns?.length
    ? targetColumns.map((n) => targetColMap.get(n.toLowerCase())).filter((c): c is DbColumn => !!c)
    : targetDb.columns.filter((c) => c.type !== "relation" && c.type !== "lookup");

  // Build target row index
  const targetRowMap = new Map(targetDb.rows.map((r) => [r.id, r]));

  // Apply source filters
  let sourceRows = applyFilters([...db.rows], filters || [], db.columns);

  // Join and build results
  let results: { id: string; cells: Record<string, unknown>; _joined: Record<string, unknown>; createdAt: string }[] = [];

  for (const row of sourceRows) {
    const linkedVal = row.cells[relationColumnId];
    const linkedIds: string[] = Array.isArray(linkedVal)
      ? linkedVal.map(String)
      : linkedVal ? [String(linkedVal)] : [];

    // For each linked target row, build a _joined map
    // If multiple links, take the first matching target row
    const joinedFields: Record<string, unknown> = {};
    let targetMatched = linkedIds.length === 0; // no links = still include (with null joined)

    for (const rid of linkedIds) {
      const targetRow = targetRowMap.get(rid);
      if (!targetRow) continue;

      // Apply target filters
      if (targetFilters && targetFilters.length > 0) {
        const passes = targetFilters.every((f) => matchesFilter(targetRow, f, targetDb.columns));
        if (!passes) continue;
      }

      // Merge target columns
      for (const tc of resolvedTargetCols) {
        joinedFields[tc.name] = targetRow.cells[tc.id] ?? null;
      }
      targetMatched = true;
      break; // take first match
    }

    if (!targetMatched) continue; // skip source rows with no matching target

    results.push({
      id: row.id,
      cells: row.cells,
      _joined: joinedFields,
      createdAt: row.createdAt,
    });
  }

  // Apply sorts (can reference both source and joined columns by ID)
  if (sorts && sorts.length > 0) {
    results = applySorts(results, sorts, [...db.columns, ...resolvedTargetCols]);
  }

  // Apply limit
  if (limit && limit > 0) {
    results = results.slice(0, limit);
  }

  return NextResponse.json({
    sourceTable: db.title,
    targetTable: targetDb.title,
    joinedColumns: resolvedTargetCols.map((c) => ({ id: c.id, name: c.name, type: c.type })),
    totalRows: results.length,
    rows: results,
  });
}
