"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Database as DbIcon, Loader2, ArrowLeft } from "lucide-react";
import type { Database, DbColumn, DbRow, DbView, DbViewType, DbFilter, DbSort } from "@/lib/types";
import DatabaseTable from "./DatabaseTable";
import DatabaseKanban from "./DatabaseKanban";
import DatabaseCalendar from "./DatabaseCalendar";
import DatabaseGallery from "./DatabaseGallery";
import DatabaseToolbar from "./DatabaseToolbar";
import DatabaseFilter from "./DatabaseFilter";
import DatabaseSort from "./DatabaseSort";
import { evaluateFormula } from "./FormulaEvaluator";

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

interface DatabaseViewProps {
  dbId: string;
  spaceSlug: string;
  canWrite: boolean;
  onClose: () => void;
  initialSearch?: string;
  onOpenDatabase?: (dbId: string, initialSearch?: string) => void;
}

export default function DatabaseView({ dbId, spaceSlug, canWrite, onClose, initialSearch, onOpenDatabase }: DatabaseViewProps) {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string>("");
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [search, setSearch] = useState(initialSearch || "");
  const [titleEdit, setTitleEdit] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [currentUser, setCurrentUser] = useState<string>("");
  const [members, setMembers] = useState<{ username: string; fullName?: string }[]>([]);
  const [allDatabases, setAllDatabases] = useState<{ id: string; title: string }[]>([]);

  const api = `/api/spaces/${encodeURIComponent(spaceSlug)}/databases/${encodeURIComponent(dbId)}`;

  const fetchDb = useCallback(async () => {
    try {
      const res = await fetch(api);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setDb(data);
      if (!activeViewId && data.views.length > 0) setActiveViewId(data.views[0].id);
    } catch { setError("Database not found"); }
    finally { setLoading(false); }
  }, [api, activeViewId]);

  useEffect(() => { fetchDb(); }, [fetchDb]);

  useEffect(() => {
    const loadContext = async () => {
      try {
        const [meRes, membersRes, dbsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/members`),
          fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/databases`),
        ]);
        if (meRes.ok) { const d = await meRes.json(); if (d.user) setCurrentUser(d.user.username); }
        if (membersRes.ok) setMembers(await membersRes.json());
        if (dbsRes.ok) { const d = await dbsRes.json(); setAllDatabases(d.map((x: { id: string; title: string }) => ({ id: x.id, title: x.title }))); }
      } catch { /* ignore */ }
    };
    loadContext();
  }, [spaceSlug]);

  const saveDb = useCallback(async (updated: Database) => {
    setDb(updated);
    await fetch(api, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: updated.title, columns: updated.columns, views: updated.views, rows: updated.rows }),
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
      ...(col.relationDbId ? { relationDbId: col.relationDbId } : {}),
      ...(col.relationDisplayColumn ? { relationDisplayColumn: col.relationDisplayColumn } : {}),
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-text-muted gap-2">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span className="text-sm">Loading database…</span>
      </div>
    );
  }

  if (error || !db) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-text-muted gap-2">
        <DbIcon className="w-6 h-6" />
        <span className="text-sm">Database not found</span>
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
            className="db-block-title-input"
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
            className="db-block-title font-semibold text-sm text-text-primary cursor-default select-none"
            onDoubleClick={() => { if (canWrite) { setTitleValue(db.title); setTitleEdit(true); } }}
            title={canWrite ? "Double-click to rename" : undefined}
          >
            {db.title}
          </span>
        )}
      </div>

      {/* Toolbar + content */}
      <div className="flex-1 overflow-auto">
        {activeView && (
          <DatabaseToolbar
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
          />
        )}
        {showFilter && activeView && (
          <DatabaseFilter
            columns={db.columns}
            filters={activeView.filters}
            filterLogic={activeView.filterLogic || "and"}
            onChange={handleFilterChange}
            onClose={() => setShowFilter(false)}
          />
        )}
        {showSort && activeView && (
          <DatabaseSort
            columns={db.columns}
            sorts={activeView.sorts}
            onChange={handleSortChange}
            onClose={() => setShowSort(false)}
          />
        )}
        {activeView?.type === "table" && (
          <DatabaseTable
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
            allDatabases={allDatabases}
            onNavigateToRelation={onOpenDatabase ? (_dbId, _rowId, label) => onOpenDatabase(_dbId, label) : undefined}
          />
        )}
        {activeView?.type === "kanban" && (
          <DatabaseKanban
            db={db}
            view={activeView}
            rows={computedRows}
            canWrite={canWrite}
            onAddRow={handleAddRow}
            onUpdateRow={handleUpdateRow}
          />
        )}
        {activeView?.type === "calendar" && (
          <DatabaseCalendar
            db={db}
            view={activeView}
            rows={computedRows}
            canWrite={canWrite}
            onAddRow={handleAddRow}
          />
        )}
        {activeView?.type === "gallery" && (
          <DatabaseGallery
            db={db}
            view={activeView}
            rows={computedRows}
          />
        )}
      </div>
    </div>
  );
}
