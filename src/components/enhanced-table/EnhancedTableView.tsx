"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Database as DbIcon, Loader2, ArrowLeft, X } from "lucide-react";
import type { EnhancedTable, DbColumn, DbRow, DbView, DbViewType, DbFilter, DbSort, DbFilterOp, DbLookupAggregate, DbConditionalFormat } from "@/lib/types";
import EnhancedTableGrid from "./EnhancedTableGrid";
import EnhancedTableKanban from "./EnhancedTableKanban";
import EnhancedTableCalendar from "./EnhancedTableCalendar";
import EnhancedTableGallery from "./EnhancedTableGallery";
import EnhancedTableToolbar from "./EnhancedTableToolbar";
import EnhancedTableFilter from "./EnhancedTableFilter";
import EnhancedTableSort from "./EnhancedTableSort";
import { evaluateFormula } from "./FormulaEvaluator";
import { generateCSV, downloadCSV, parseCSV } from "@/lib/csv";

// ── Filter / Sort / Search helpers ──────────────────────────────────────────

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

function applyFilters(rows: DbRow[], filters: DbFilter[], logic: "and" | "or", columns: DbColumn[]): DbRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => {
    const results = filters.map((f) => matchesFilter(row, f, columns));
    return logic === "or" ? results.some(Boolean) : results.every(Boolean);
  });
}

function applySorts(rows: DbRow[], sorts: DbSort[], columns: DbColumn[]): DbRow[] {
  if (sorts.length === 0) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const col = columns.find((c) => c.id === s.columnId);
      if (!col) continue;
      const av = a.cells[s.columnId], bv = b.cells[s.columnId];
      const aEmpty = av == null || av === "";
      const bEmpty = bv == null || bv === "";
      // Empty/null values always sort last regardless of direction
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
      if (aEmpty && bEmpty) continue;
      let cmp = 0;
      if (col.type === "number") cmp = (Number(av) || 0) - (Number(bv) || 0);
      else cmp = String(av).localeCompare(String(bv));
      if (cmp !== 0) return s.dir === "desc" ? -cmp : cmp;
    }
    return 0;
  });
}

function applySearch(rows: DbRow[], search: string, columns: DbColumn[]): DbRow[] {
  if (!search) return rows;
  const q = search.toLowerCase();
  return rows.filter((row) =>
    columns.some((c) => String(row.cells[c.id] || "").toLowerCase().includes(q))
  );
}

// ── Component ────────────────────────────────────────────────────────────────

// ── Inline tag adder for database view ─────────────────────────────────────
function DbTagAdder({ spaceSlug, existingTags, onAdd }: {
  spaceSlug: string;
  existingTags: string[];
  onAdd: (tag: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/tags`)
      .then((r) => r.json())
      .then((idx) => setAllTags(Object.keys(idx)))
      .catch(() => {});
  }, [open, spaceSlug]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setValue(""); }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const available = allTags.filter((t) => !existingTags.includes(t));
  const filtered = value
    ? available.filter((t) => t.toLowerCase().includes(value.toLowerCase())).slice(0, 8)
    : available.slice(0, 8);

  const submit = (tag: string) => {
    const clean = tag.trim().toLowerCase().replace(/[^a-z0-9_/-]/g, "");
    if (clean && !existingTags.includes(clean)) onAdd(clean);
    setValue("");
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button className="doc-tag-add" onClick={() => setOpen(true)} title="Add tag">+</button>
      {open && (
        <div className="doc-tag-dropdown">
          <input
            autoFocus
            className="doc-tag-input"
            placeholder="Add tag..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && value.trim()) submit(value); if (e.key === "Escape") { setOpen(false); setValue(""); } }}
          />
          {filtered.length > 0 && (
            <div className="doc-tag-suggestions">
              {filtered.map((t) => (
                <button key={t} className="doc-tag-suggestion" onClick={() => submit(t)}>
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface EnhancedTableViewProps {
  dbId: string;
  spaceSlug: string;
  canWrite: boolean;
  onClose: () => void;
  initialSearch?: string;
  onOpenDatabase?: (dbId: string, initialSearch?: string) => void;
  tagColors?: Record<string, string>;
}

function tagContrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

export default function EnhancedTableView({ dbId, spaceSlug, canWrite, onClose, initialSearch, onOpenDatabase, tagColors = {} }: EnhancedTableViewProps) {
  const [db, setDb] = useState<EnhancedTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [showConditionalFormat, setShowConditionalFormat] = useState(false);
  const [search, setSearch] = useState(initialSearch || "");
  const [titleEdit, setTitleEdit] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [currentUser, setCurrentUser] = useState<string>("");
  const [members, setMembers] = useState<{ username: string; fullName?: string }[]>([]);
  // Cache of target tables for lookup column resolution: "space/dbId" -> EnhancedTable
  const [targetTableCache, setTargetTableCache] = useState<Record<string, EnhancedTable>>({});

  const api = `/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables/${encodeURIComponent(dbId)}`;

  const fetchDb = useCallback(async () => {
    try {
      const res = await fetch(api);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setDb(data);
      if (!activeViewId && data.views.length > 0) setActiveViewId(data.views[0].id);
    } catch { setError("Enhanced table not found"); }
    finally { setLoading(false); }
  }, [api, activeViewId]);

  useEffect(() => { fetchDb(); }, [fetchDb]);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const [meRes, membersRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/members`),
        ]);
        if (meRes.ok) { const d = await meRes.json(); if (d.user) setCurrentUser(d.user.username); }
        if (membersRes.ok) setMembers(await membersRes.json());
      } catch { /* ignore */ }
    };
    loadContext();
  }, [spaceSlug]);

  const saveDb = useCallback(async (updated: EnhancedTable) => {
    setDb(updated);
    await fetch(api, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: updated.title, columns: updated.columns, views: updated.views, rows: updated.rows, tags: updated.tags }),
    });
  }, [api]);

  // ── CRUD handlers ──────────────────────────────────────────────────────────

  const handleAddRow = useCallback(async (cells?: Record<string, unknown>) => {
    const defaults: Record<string, unknown> = {};
    if (db) {
      for (const col of db.columns) {
        if (col.type === "createdBy") defaults[col.id] = currentUser || "";
        else if (col.type === "date" && col.defaultCurrentDate) defaults[col.id] = new Date().toISOString().split("T")[0];
        else if (col.defaultValue !== undefined && col.defaultValue !== null) defaults[col.id] = col.defaultValue;
      }
    }
    const res = await fetch(`${api}/rows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells: { ...defaults, ...(cells || {}) } }),
    });
    if (res.ok) fetchDb();
  }, [api, fetchDb, db, currentUser]);

  const handleUpdateRow = useCallback(async (rowId: string, cells: Record<string, unknown>) => {
    setDb((prev) => {
      if (!prev) return prev;
      const rows = prev.rows.map((r) => r.id === rowId ? { ...r, cells: { ...r.cells, ...cells } } : r);
      return { ...prev, rows };
    });
    await fetch(`${api}/rows/${encodeURIComponent(rowId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cells }),
    });
  }, [api]);

  const handleDeleteRow = useCallback(async (rowId: string) => {
    setDb((prev) => prev ? { ...prev, rows: prev.rows.filter((r) => r.id !== rowId) } : prev);
    await fetch(`${api}/rows/${encodeURIComponent(rowId)}`, { method: "DELETE" });
  }, [api]);

  const handleAddColumn = useCallback(async (col: Partial<DbColumn>) => {
    if (!db) return;
    const newCol: DbColumn = {
      id: Math.random().toString(36).slice(2, 10),
      name: col.name || "Column",
      type: col.type || "text",
      ...(col.options ? { options: col.options } : {}),
      ...(col.width ? { width: col.width } : { width: 150 }),
      ...(col.defaultValue !== undefined ? { defaultValue: col.defaultValue } : {}),
      ...(col.defaultCurrentDate ? { defaultCurrentDate: col.defaultCurrentDate } : {}),
    };
    const columns = [...db.columns, newCol];
    const views = db.views.map((v) => ({
      ...v,
      columnOrder: [...(v.columnOrder || db.columns.map((c) => c.id)), newCol.id],
    }));
    await saveDb({ ...db, columns, views });
  }, [db, saveDb]);

  const handleUpdateColumn = useCallback(async (colId: string, updates: Partial<DbColumn>) => {
    if (!db) return;
    const columns = db.columns.map((c) => c.id === colId ? { ...c, ...updates } : c);
    await saveDb({ ...db, columns });
  }, [db, saveDb]);

  const handleDeleteColumn = useCallback(async (colId: string) => {
    if (!db) return;
    const columns = db.columns.filter((c) => c.id !== colId);
    const views = db.views.map((v) => ({
      ...v,
      columnOrder: (v.columnOrder || []).filter((id) => id !== colId),
      hiddenColumns: (v.hiddenColumns || []).filter((id) => id !== colId),
    }));
    const rows = db.rows.map((r) => {
      const cells = { ...r.cells };
      delete cells[colId];
      return { ...r, cells };
    });
    await saveDb({ ...db, columns, views, rows });
  }, [db, saveDb]);

  // ── View management ────────────────────────────────────────────────────────

  const activeView = db?.views.find((v) => v.id === activeViewId) || db?.views[0];

  const handleUpdateView = useCallback(async (viewUpdates: Partial<DbView>) => {
    if (!db || !activeView) return;
    const views = db.views.map((v) => v.id === activeView.id ? { ...v, ...viewUpdates } : v);
    await saveDb({ ...db, views });
  }, [db, activeView, saveDb]);

  const handleAddView = useCallback(async (type: DbViewType, name: string) => {
    if (!db) return;
    const selectCol = db.columns.find((c) => c.type === "select");
    const dateCol = db.columns.find((c) => c.type === "date");
    const newView: DbView = {
      id: Math.random().toString(36).slice(2, 10),
      name,
      type,
      filters: [],
      sorts: [],
      columnOrder: db.columns.map((c) => c.id),
      ...(type === "kanban" && selectCol ? { groupBy: selectCol.id } : {}),
      ...(type === "calendar" && dateCol ? { groupBy: dateCol.id } : {}),
    };
    const views = [...db.views, newView];
    await saveDb({ ...db, views });
    setActiveViewId(newView.id);
  }, [db, saveDb]);

  const handleRenameView = useCallback(async (viewId: string, name: string) => {
    if (!db) return;
    const views = db.views.map((v) => v.id === viewId ? { ...v, name } : v);
    await saveDb({ ...db, views });
  }, [db, saveDb]);

  const handleDeleteView = useCallback(async (viewId: string) => {
    if (!db || db.views.length <= 1) return;
    const views = db.views.filter((v) => v.id !== viewId);
    await saveDb({ ...db, views });
    if (activeViewId === viewId) setActiveViewId(views[0].id);
  }, [db, saveDb, activeViewId]);

  const handleSwitchView = useCallback((vid: string) => {
    setActiveViewId(vid);
  }, []);

  const handleShowHidden = useCallback(() => {
    if (!activeView) return;
    handleUpdateView({ hiddenColumns: [] });
  }, [activeView, handleUpdateView]);

  const handleFilterChange = useCallback((filters: DbFilter[], logic: "and" | "or") => {
    handleUpdateView({ filters, filterLogic: logic });
  }, [handleUpdateView]);

  const handleSortChange = useCallback((sorts: DbSort[]) => {
    handleUpdateView({ sorts });
  }, [handleUpdateView]);

  const handleConditionalFormatChange = useCallback((conditionalFormats: DbConditionalFormat[]) => {
    handleUpdateView({ conditionalFormats });
  }, [handleUpdateView]);

  // CSV import handler
  const csvInputRef = useRef<HTMLInputElement>(null);
  const handleImportCSV = useCallback(() => {
    csvInputRef.current?.click();
  }, []);
  const handleCSVFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !db) return;
    const text = await file.text();
    const { headers, rows: csvRows } = parseCSV(text);
    const colMap = new Map<string, string>();
    for (const h of headers) {
      const col = db.columns.find((c) => c.name.toLowerCase() === h.toLowerCase());
      if (col) colMap.set(h, col.id);
    }
    for (const csvRow of csvRows) {
      const cells: Record<string, unknown> = {};
      for (const [header, colId] of colMap) {
        const val = csvRow[header];
        if (val !== undefined && val !== "") {
          const col = db.columns.find((c) => c.id === colId);
          if (col?.type === "number") cells[colId] = Number(val) || 0;
          else if (col?.type === "checkbox") cells[colId] = val.toLowerCase() === "true" || val === "1";
          else cells[colId] = val;
        }
      }
      await handleAddRow(cells);
    }
    if (csvInputRef.current) csvInputRef.current.value = "";
  }, [db, handleAddRow]);

  // Fetch target tables for lookup columns
  useEffect(() => {
    if (!db) return;
    const lookupCols = db.columns.filter((c) => c.type === "lookup" && c.lookup);
    if (lookupCols.length === 0) return;
    const needed = new Map<string, { space: string; dbId: string }>();
    for (const lc of lookupCols) {
      const relCol = db.columns.find((c) => c.id === lc.lookup!.relationColumnId);
      if (!relCol?.relation) continue;
      const key = `${relCol.relation.targetSpace}/${relCol.relation.targetDbId}`;
      if (!targetTableCache[key] && !needed.has(key)) {
        needed.set(key, { space: relCol.relation.targetSpace, dbId: relCol.relation.targetDbId });
      }
    }
    for (const [key, { space, dbId: tDbId }] of needed) {
      fetch(`/api/spaces/${encodeURIComponent(space)}/enhanced-tables/${encodeURIComponent(tDbId)}`)
        .then((r) => r.json())
        .then((data: EnhancedTable) => {
          setTargetTableCache((prev) => ({ ...prev, [key]: data }));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db?.columns]);

  // ── Computed rows (stable ordering) ─────────────────────────────────────────
  // Only re-sort when sort config, filters, search, or the row set changes —
  // NOT when cell data changes. This prevents rows from jumping while editing.
  const stableOrderRef = useRef<string[]>([]);
  const lastSortKeyRef = useRef("");

  const computedRows = (() => {
    if (!db || !activeView) return [];
    let result = [...db.rows];
    const formulaCols = db.columns.filter((c) => c.type === "formula" && c.formula);
    if (formulaCols.length > 0) {
      result = result.map((row) => {
        const cells = { ...row.cells };
        for (const fc of formulaCols) {
          cells[fc.id] = evaluateFormula(fc.formula!, row, db.columns);
        }
        return { ...row, cells };
      });
    }

    // Resolve lookup columns from cached target tables
    const lookupCols = db.columns.filter((c) => c.type === "lookup" && c.lookup);
    if (lookupCols.length > 0) {
      result = result.map((row) => {
        const cells = { ...row.cells };
        for (const lc of lookupCols) {
          const lookup = lc.lookup!;
          const relCol = db.columns.find((c) => c.id === lookup.relationColumnId);
          if (!relCol?.relation) continue;
          const key = `${relCol.relation.targetSpace}/${relCol.relation.targetDbId}`;
          const targetDb = targetTableCache[key];
          if (!targetDb) continue;

          // Get linked row IDs
          const linkedVal = row.cells[relCol.id];
          const linkedIds: string[] = Array.isArray(linkedVal)
            ? linkedVal.map(String)
            : linkedVal ? [String(linkedVal)] : [];

          // Pull values from target rows
          const values: unknown[] = [];
          for (const rid of linkedIds) {
            const targetRow = targetDb.rows.find((r) => r.id === rid);
            if (targetRow) values.push(targetRow.cells[lookup.targetColumnId]);
          }

          // Aggregate
          const agg: DbLookupAggregate = lookup.aggregate || "list";
          const nums = values.map(Number).filter((n) => !isNaN(n));
          switch (agg) {
            case "first": cells[lc.id] = values[0] ?? null; break;
            case "count": cells[lc.id] = values.length; break;
            case "sum": cells[lc.id] = nums.reduce((a, b) => a + b, 0); break;
            case "avg": cells[lc.id] = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; break;
            case "min": cells[lc.id] = nums.length ? Math.min(...nums) : null; break;
            case "max": cells[lc.id] = nums.length ? Math.max(...nums) : null; break;
            case "list":
            default:
              cells[lc.id] = values.filter((v) => v != null).map(String);
              break;
          }
        }
        return { ...row, cells };
      });
    }
    result = applyFilters(result, activeView.filters, activeView.filterLogic || "and", db.columns);
    result = applySearch(result, search, db.columns);

    // Build a key from sort config + row IDs (sorted) to detect structural changes
    const currentRowIds = result.map((r) => r.id).sort().join(",");
    const sortKey = JSON.stringify(activeView.sorts) + "|" + JSON.stringify(activeView.filters) + "|" + search + "|" + currentRowIds;

    if (sortKey !== lastSortKeyRef.current) {
      lastSortKeyRef.current = sortKey;
      result = applySorts(result, activeView.sorts, db.columns);
      stableOrderRef.current = result.map((r) => r.id);
      return result;
    }

    // Use stable order — map IDs to current (updated) row data
    const rowMap = new Map(result.map((r) => [r.id, r]));
    return stableOrderRef.current.filter((id) => rowMap.has(id)).map((id) => rowMap.get(id)!);
  })();

  // CSV export handler (must be after computedRows)
  const handleExportCSV = useCallback(() => {
    if (!db || !activeView) return;
    const cols = (activeView.columnOrder || db.columns.map((c) => c.id))
      .map((id) => db.columns.find((c) => c.id === id))
      .filter((c): c is DbColumn => !!c && !(activeView.hiddenColumns || []).includes(c.id));
    const csv = generateCSV(cols, computedRows);
    downloadCSV(csv, `${db.title.replace(/[^a-zA-Z0-9]/g, "_")}.csv`);
  }, [db, activeView, computedRows]);

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-text-muted gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading enhanced table…</span>
      </div>
    );
  }

  if (error || !db) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-text-muted gap-2">
        <DbIcon className="w-6 h-6" />
        <span className="text-sm">Enhanced table not found</span>
      </div>
    );
  }

  const hiddenCount = activeView?.hiddenColumns?.length || 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-border bg-surface flex-shrink-0">
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-muted transition-colors"
          title="Back to documents"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <DbIcon className="w-4 h-4 text-accent flex-shrink-0" />
        {titleEdit ? (
          <input
            autoFocus
            className="et-block-title-input"
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={() => {
              if (titleValue.trim() && titleValue !== db.title) saveDb({ ...db, title: titleValue.trim() });
              setTitleEdit(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                if (titleValue.trim() && titleValue !== db.title) saveDb({ ...db, title: titleValue.trim() });
                setTitleEdit(false);
              }
              if (e.key === "Escape") setTitleEdit(false);
            }}
          />
        ) : (
          <span
            className="et-block-title font-semibold text-sm text-text-primary cursor-default select-none"
            onDoubleClick={() => { if (canWrite) { setTitleValue(db.title); setTitleEdit(true); } }}
            title={canWrite ? "Double-click to rename" : undefined}
          >
          {db.title}
          </span>
        )}
        {/* Tag chips */}
        {(db.tags && db.tags.length > 0) && (
          <div className="doc-tag-chips">
            {db.tags.map((tag) => {
              const color = tagColors[tag];
              return (
                <span
                  key={tag}
                  className="doc-tag-chip"
                  style={color ? { background: color, color: tagContrastText(color) } : undefined}
                >
                  {tag}
                  {canWrite && (
                    <button
                      className="doc-tag-chip-remove"
                      style={color ? { color: tagContrastText(color) } : undefined}
                      onClick={() => {
                        const tags = (db.tags || []).filter((t) => t !== tag);
                        saveDb({ ...db, tags: tags.length > 0 ? tags : undefined });
                      }}
                      title={`Remove tag "${tag}"`}
                    >
                      ×
                    </button>
                  )}
                </span>
              );
            })}
          </div>
        )}
        {canWrite && (
          <DbTagAdder
            spaceSlug={spaceSlug}
            existingTags={db.tags || []}
            onAdd={(tag) => {
              const tags = [...(db.tags || []), tag];
              saveDb({ ...db, tags });
            }}
          />
        )}
      </div>

      {/* Toolbar + content */}
      <div className="flex-1 overflow-auto">
        {activeView && (
          <EnhancedTableToolbar
            db={db}
            activeViewId={activeView.id}
            onSwitchView={handleSwitchView}
            onAddView={handleAddView}
            onRenameView={handleRenameView}
            onDeleteView={handleDeleteView}
            showFilter={showFilter}
            onToggleFilter={() => setShowFilter((v) => !v)}
            showSort={showSort}
            onToggleSort={() => setShowSort((v) => !v)}
            filterCount={activeView.filters.length}
            sortCount={activeView.sorts.length}
            search={search}
            onSearch={setSearch}
            canWrite={canWrite}
            onShowHidden={handleShowHidden}
            hiddenCount={hiddenCount}
            onExportCSV={handleExportCSV}
            onImportCSV={handleImportCSV}
            showConditionalFormat={showConditionalFormat}
            onToggleConditionalFormat={() => setShowConditionalFormat((v) => !v)}
            conditionalFormatCount={activeView.conditionalFormats?.length || 0}
          />
        )}
        {/* Hidden CSV file input */}
        <input ref={csvInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleCSVFileChange} />
        {showFilter && activeView && (
          <EnhancedTableFilter
            columns={db.columns}
            filters={activeView.filters}
            filterLogic={activeView.filterLogic || "and"}
            onChange={handleFilterChange}
            onClose={() => setShowFilter(false)}
          />
        )}
        {showSort && activeView && (
          <EnhancedTableSort
            columns={db.columns}
            sorts={activeView.sorts}
            onChange={handleSortChange}
            onClose={() => setShowSort(false)}
          />
        )}
        {showConditionalFormat && activeView && (
          <div className="et-cond-format-panel">
            <div className="et-cond-format-header">
              <span>Conditional Formatting</span>
              <button className="et-cond-format-close" onClick={() => setShowConditionalFormat(false)}>×</button>
            </div>
            {(activeView.conditionalFormats || []).map((cf, i) => (
              <div key={i} className="qb-filter-row">
                <select className="qb-select qb-select-sm" value={cf.columnId} onChange={(e) => {
                  const next = [...(activeView.conditionalFormats || [])]; next[i] = { ...cf, columnId: e.target.value };
                  handleConditionalFormatChange(next);
                }}>
                  <option value="">Column…</option>
                  {db.columns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select className="qb-select qb-select-sm" value={cf.op} onChange={(e) => {
                  const next = [...(activeView.conditionalFormats || [])]; next[i] = { ...cf, op: e.target.value as DbFilterOp };
                  handleConditionalFormatChange(next);
                }}>
                  <option value="eq">=</option>
                  <option value="neq">≠</option>
                  <option value="contains">contains</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="isEmpty">is empty</option>
                  <option value="isNotEmpty">is not empty</option>
                </select>
                {cf.op !== "isEmpty" && cf.op !== "isNotEmpty" && (
                  <input className="qb-input" style={{ maxWidth: 80 }} value={String(cf.value ?? "")} onChange={(e) => {
                    const next = [...(activeView.conditionalFormats || [])]; next[i] = { ...cf, value: e.target.value };
                    handleConditionalFormatChange(next);
                  }} placeholder="Value" />
                )}
                <input type="color" value={cf.style.bg || "#fef08a"} onChange={(e) => {
                  const next = [...(activeView.conditionalFormats || [])]; next[i] = { ...cf, style: { ...cf.style, bg: e.target.value } };
                  handleConditionalFormatChange(next);
                }} title="Background color" style={{ width: 28, height: 28, border: "none", cursor: "pointer", borderRadius: 4, padding: 0 }} />
                <label className="qb-check" style={{ gap: 2 }}>
                  <input type="checkbox" checked={cf.style.bold || false} onChange={(e) => {
                    const next = [...(activeView.conditionalFormats || [])]; next[i] = { ...cf, style: { ...cf.style, bold: e.target.checked } };
                    handleConditionalFormatChange(next);
                  }} /> <strong>B</strong>
                </label>
                <button className="qb-remove" onClick={() => {
                  handleConditionalFormatChange((activeView.conditionalFormats || []).filter((_, j) => j !== i));
                }}>×</button>
              </div>
            ))}
            {canWrite && (
              <button className="qb-add-btn" onClick={() => {
                handleConditionalFormatChange([
                  ...(activeView.conditionalFormats || []),
                  { columnId: db.columns[0]?.id || "", op: "eq", value: "", style: { bg: "#fef08a" } },
                ]);
              }}>+ Add rule</button>
            )}
          </div>
        )}
        {activeView?.type === "table" && (
          <EnhancedTableGrid
            db={db}
            view={activeView}
            rows={computedRows}
            canWrite={canWrite}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
            onDeleteRow={handleDeleteRow}
            onAddColumn={handleAddColumn}
            onUpdateColumn={handleUpdateColumn}
            onDeleteColumn={handleDeleteColumn}
            onUpdateView={handleUpdateView}
            currentUser={currentUser}
            members={members}
            spaceSlug={spaceSlug}
            tagColors={tagColors}
            onOpenDatabase={onOpenDatabase}
            onSearch={setSearch}
          />
        )}
        {activeView?.type === "kanban" && (
          <EnhancedTableKanban
            db={db}
            view={activeView}
            rows={computedRows}
            canWrite={canWrite}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
          />
        )}
        {activeView?.type === "calendar" && (
          <EnhancedTableCalendar
            db={db}
            view={activeView}
            rows={computedRows}
            canWrite={canWrite}
            onAddRow={handleAddRow}
          />
        )}
        {activeView?.type === "gallery" && (
          <EnhancedTableGallery
            db={db}
            view={activeView}
            rows={computedRows}
          />
        )}
      </div>
    </div>
  );
}
