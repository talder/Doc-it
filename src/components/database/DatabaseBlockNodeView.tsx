"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper } from "@tiptap/react";
import { Database as DbIcon, Pencil, Loader2, AlignJustify, CreditCard, Crop, Maximize2, X } from "lucide-react";
import type { Database, DbColumn, DbRow, DbView, DbViewType, DbFilter, DbSort } from "@/lib/types";
import DatabaseTable from "./DatabaseTable";
import DatabaseKanban from "./DatabaseKanban";
import DatabaseCalendar from "./DatabaseCalendar";
import DatabaseGallery from "./DatabaseGallery";
import DatabaseToolbar from "./DatabaseToolbar";
import DatabaseFilter from "./DatabaseFilter";
import DatabaseSort from "./DatabaseSort";
import { evaluateFormula } from "./FormulaEvaluator";

interface NodeViewProps {
  node: { attrs: { dbId: string; viewId: string; spaceSlug: string; displayMode?: string } };
  updateAttributes: (attrs: Record<string, unknown>) => void;
}

// ── Filter / Sort / Search helpers ─────────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────────────────────

export function DatabaseBlockNodeView({ node, updateAttributes }: NodeViewProps) {
  const { dbId, viewId, spaceSlug } = node.attrs;
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState(viewId);
  const [showFilter, setShowFilter] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [search, setSearch] = useState("");
  const [titleEdit, setTitleEdit] = useState(false);
  const [titleValue, setTitleValue] = useState("");
  const [currentUser, setCurrentUser] = useState<string>("");
  const [members, setMembers] = useState<{ username: string; fullName?: string }[]>([]);
  const [isModal, setIsModal] = useState(false);
  const displayMode = (node.attrs.displayMode as "inline" | "card" | "embed") || "inline";

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

  // Fetch current user and space members for member/createdBy fields
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

  const saveDb = useCallback(async (updated: Database) => {
    setDb(updated);
    await fetch(api, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: updated.title, columns: updated.columns, views: updated.views, rows: updated.rows }),
    });
  }, [api]);

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  const handleAddRow = useCallback(async (cells?: Record<string, unknown>) => {
    // Apply column defaults before creating the row
    const defaults: Record<string, unknown> = {};
    if (db) {
      for (const col of db.columns) {
        if (col.type === "createdBy") {
          defaults[col.id] = currentUser || "";
        } else if (col.type === "date" && col.defaultCurrentDate) {
          defaults[col.id] = new Date().toISOString().split("T")[0];
        } else if (col.defaultValue !== undefined && col.defaultValue !== null) {
          defaults[col.id] = col.defaultValue;
        }
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
    // Optimistic update
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

  // ── View management ───────────────────────────────────────────────────────

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
    updateAttributes({ viewId: newView.id });
  }, [db, saveDb, updateAttributes]);

  const handleRenameView = useCallback(async (viewId: string, name: string) => {
    if (!db) return;
    const views = db.views.map((v) => v.id === viewId ? { ...v, name } : v);
    await saveDb({ ...db, views });
  }, [db, saveDb]);

  const handleDeleteView = useCallback(async (viewId: string) => {
    if (!db || db.views.length <= 1) return;
    const views = db.views.filter((v) => v.id !== viewId);
    await saveDb({ ...db, views });
    if (activeViewId === viewId) {
      setActiveViewId(views[0].id);
      updateAttributes({ viewId: views[0].id });
    }
  }, [db, saveDb, activeViewId, updateAttributes]);

  const handleSwitchView = useCallback((vid: string) => {
    setActiveViewId(vid);
    updateAttributes({ viewId: vid });
  }, [updateAttributes]);

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

  const handleSetDisplayMode = useCallback((mode: "inline" | "card" | "embed") => {
    updateAttributes({ displayMode: mode });
  }, [updateAttributes]);

  // ── Computed rows (stable ordering) ──────────────────────────────────────
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

    const currentRowIds = result.map((r) => r.id).sort().join(",");
    const sortKey = JSON.stringify(activeView.sorts) + "|" + JSON.stringify(activeView.filters) + "|" + search + "|" + currentRowIds;

    if (sortKey !== lastSortKeyRef.current) {
      lastSortKeyRef.current = sortKey;
      result = applySorts(result, activeView.sorts, db.columns);
      stableOrderRef.current = result.map((r) => r.id);
      return result;
    }

    const rowMap = new Map(result.map((r) => [r.id, r]));
    return stableOrderRef.current.filter((id) => rowMap.has(id)).map((id) => rowMap.get(id)!);
  })();

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <NodeViewWrapper className="my-3">
        <div className="db-block db-block-loading">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading database…
        </div>
      </NodeViewWrapper>
    );
  }

  if (error || !db) {
    return (
      <NodeViewWrapper className="my-3">
        <div className="db-block db-block-error">
          <DbIcon className="w-4 h-4" /> Database not found
        </div>
      </NodeViewWrapper>
    );
  }

  const hiddenCount = activeView?.hiddenColumns?.length || 0;
  const canWrite = true;

  // ── Shared header bar ────────────────────────────────────────────────────
  const headerBar = (
    <div className="db-block-header">
      <DbIcon className="w-4 h-4 text-accent" />
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
          className="db-block-title"
          onDoubleClick={() => { setTitleValue(db.title); setTitleEdit(true); }}
        >
          {db.title}
        </span>
      )}
      <div className="db-block-header-actions">
        <button
          className={`db-display-btn${displayMode === "inline" ? " active" : ""}`}
          onClick={() => handleSetDisplayMode("inline")}
          title="Inline – full table"
        >
          <AlignJustify className="w-3.5 h-3.5" />
        </button>
        <button
          className={`db-display-btn${displayMode === "card" ? " active" : ""}`}
          onClick={() => handleSetDisplayMode("card")}
          title="Card – compact preview"
        >
          <CreditCard className="w-3.5 h-3.5" />
        </button>
        <button
          className={`db-display-btn${displayMode === "embed" ? " active" : ""}`}
          onClick={() => handleSetDisplayMode("embed")}
          title="Embed – scrollable frame"
        >
          <Crop className="w-3.5 h-3.5" />
        </button>
        <span className="db-display-sep" />
        <button
          className="db-display-btn"
          onClick={() => setIsModal(true)}
          title="Open fullscreen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  // ── Toolbar + views (reused in inline/embed) ──────────────────────────────
  const dbViews = (
    <>
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
    </>
  );

  return (
    <NodeViewWrapper className="my-3" contentEditable={false}>
      <div className={`db-block${displayMode === "embed" ? " db-block-embed-mode" : ""}`}>
        {headerBar}

        {/* Card mode: compact meta bar only */}
        {displayMode === "card" && (
          <div className="db-block-card-meta-bar">
            <span>{db.rows.length} rows</span>
            <span>·</span>
            <span>{db.columns.length} fields</span>
            <span>·</span>
            <span>{activeView?.name || "Table"}</span>
            <button
              className="db-block-card-open"
              onClick={() => setIsModal(true)}
              title="Open fullscreen"
            >
              <Maximize2 className="w-3 h-3" /> Open
            </button>
          </div>
        )}

        {/* Embed mode: full content in a scrollable frame */}
        {displayMode === "embed" && (
          <div className="db-embed-scroll">
            {dbViews}
          </div>
        )}

        {/* Inline mode: full content, no constraints */}
        {displayMode === "inline" && dbViews}
      </div>

      {/* Fullscreen modal */}
      {isModal && typeof document !== "undefined" && createPortal(
        <div
          className="db-modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setIsModal(false); }}
        >
          <div className="db-modal-content">
            <div className="db-modal-header">
              <DbIcon className="w-4 h-4 text-accent" />
              <span className="db-modal-title">{db.title}</span>
              <button className="db-modal-close" onClick={() => setIsModal(false)}>
                <X className="w-4 h-4" />
              </button>
            </div>
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
            <div className="db-modal-body">
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
        </div>,
        document.body
      )}
    </NodeViewWrapper>
  );
}
