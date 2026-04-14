"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, MoreVertical, GripVertical, Copy, Eraser, X, ArrowUp, ArrowDown, Link2, Search, Hash, Pencil, Edit3 } from "lucide-react";
import type { EnhancedTable, DbColumn, DbRow, DbView, DbColumnType, DbLookupAggregate, DbConditionalFormat } from "@/lib/types";
import RowEditModal from "./RowEditModal";

function matchesCfRule(row: DbRow, rule: DbConditionalFormat, columns: DbColumn[]): boolean {
  const col = columns.find((c) => c.id === rule.columnId);
  if (!col) return false;
  const raw = row.cells[col.id];
  const v = raw != null ? String(raw) : "";
  const fv = rule.value != null ? String(rule.value) : "";
  switch (rule.op) {
    case "eq": case "is": return v === fv;
    case "neq": case "isNot": return v !== fv;
    case "contains": return v.toLowerCase().includes(fv.toLowerCase());
    case "isEmpty": return v === "";
    case "isNotEmpty": return v !== "";
    case "gt": return Number(raw) > Number(rule.value);
    case "lt": return Number(raw) < Number(rule.value);
    default: return false;
  }
}

const COLUMN_TYPES: { value: DbColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "select", label: "Select" },
  { value: "multiSelect", label: "Multi Select" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "url", label: "URL" },
  { value: "email", label: "Email" },
  { value: "member", label: "Member" },
  { value: "createdBy", label: "Created By" },
  { value: "relation", label: "Relation" },
  { value: "lookup", label: "Lookup" },
  { value: "tag", label: "Tag" },
];

const LOOKUP_AGGREGATES: { value: DbLookupAggregate; label: string }[] = [
  { value: "list", label: "List" },
  { value: "first", label: "First" },
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
];

interface Props {
  db: EnhancedTable;
  view: DbView;
  rows: DbRow[];          // already filtered+sorted
  canWrite: boolean;
  onAddRow: (cells?: Record<string, unknown>) => void;
  onUpdateRow: (rowId: string, cells: Record<string, unknown>) => void;
  onDeleteRow: (rowId: string) => void;
  onAddColumn: (col: Partial<DbColumn>) => void;
  onUpdateColumn: (colId: string, updates: Partial<DbColumn>) => void;
  onDeleteColumn: (colId: string) => void;
  onUpdateView: (viewUpdates: Partial<DbView>) => void;
  currentUser?: string;
  members?: { username: string; fullName?: string }[];
  spaceSlug?: string;
  tagColors?: Record<string, string>;
  onOpenDatabase?: (dbId: string, initialSearch?: string) => void;
  onSearch?: (query: string) => void;
}

const TAG_PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c",
];

function tagContrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

export default function DatabaseTable({
  db, view, rows, canWrite,
  onAddRow, onUpdateRow, onDeleteRow,
  onAddColumn, onUpdateColumn, onDeleteColumn, onUpdateView,
  currentUser, members = [], spaceSlug, tagColors = {}, onOpenDatabase, onSearch,
}: Props) {
  const [editCell, setEditCell] = useState<{ rowId: string; colId: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [colMenu, setColMenu] = useState<string | null>(null);
  const [colRename, setColRename] = useState<{ colId: string; name: string } | null>(null);
  const [colTypeChange, setColTypeChange] = useState<string | null>(null);
  const [selectEditCol, setSelectEditCol] = useState<string | null>(null);
  const [selectOptions, setSelectOptions] = useState<string>("");
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [colDefaultPanel, setColDefaultPanel] = useState<string | null>(null);
  const [relationConfigCol, setRelationConfigCol] = useState<string | null>(null);
  const [lookupConfigCol, setLookupConfigCol] = useState<string | null>(null);

  // Relation config state
  const [relSpaces, setRelSpaces] = useState<{ slug: string; name: string }[]>([]);
  const [relTables, setRelTables] = useState<{ id: string; title: string; columns: { id: string; name: string; type: string }[] }[]>([]);
  const [relSelectedSpace, setRelSelectedSpace] = useState("");
  const [relSelectedDb, setRelSelectedDb] = useState("");
  const [relSelectedDisplayCol, setRelSelectedDisplayCol] = useState("");
  const [relLimit, setRelLimit] = useState<"one" | "many">("many");
  const [relBidirectional, setRelBidirectional] = useState(false);

  // Lookup config state
  const [lookupRelCol, setLookupRelCol] = useState("");
  const [lookupTargetCol, setLookupTargetCol] = useState("");
  const [lookupAggregate, setLookupAggregate] = useState<DbLookupAggregate>("list");
  const [lookupTargetCols, setLookupTargetCols] = useState<{ id: string; name: string }[]>([]);

  // Relation cell editor state
  const [relationSearch, setRelationSearch] = useState("");
  const [relationTargetRows, setRelationTargetRows] = useState<{ id: string; label: string }[]>([]);
  const [relationTargetLoading, setRelationTargetLoading] = useState(false);

  // Relation label cache: columnId -> { rowId -> label }
  const [relationLabels, setRelationLabels] = useState<Record<string, Record<string, string>>>({});

  // Tag cell editor state
  const [tagSearch, setTagSearch] = useState("");
  const [spaceTags, setSpaceTags] = useState<string[]>([]);
  const [tagCreating, setTagCreating] = useState(false);
  const [tagNewName, setTagNewName] = useState("");
  const [tagNewColor, setTagNewColor] = useState<string | null>(null);
  const [localTagColors, setLocalTagColors] = useState<Record<string, string>>(tagColors);

  // Keep local tag colors in sync with prop
  useEffect(() => { setLocalTagColors(tagColors); }, [tagColors]);

  // Row edit modal state
  const [editModalRowId, setEditModalRowId] = useState<string | null>(null);

  // Bulk edit state
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkEditColId, setBulkEditColId] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState<string>("");

  const colMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const tabNavigating = useRef(false);

  // Column ordering
  const orderedCols = (() => {
    const order = view.columnOrder || db.columns.map((c) => c.id);
    const hidden = new Set(view.hiddenColumns || []);
    return order
      .map((id) => db.columns.find((c) => c.id === id))
      .filter((c): c is DbColumn => !!c && !hidden.has(c.id));
  })();

  const getWidth = (col: DbColumn) => view.columnWidths?.[col.id] || col.width || 150;

  // Fetch relation labels for all relation columns on mount / db change
  useEffect(() => {
    if (!spaceSlug) return;
    const relCols = db.columns.filter((c) => c.type === "relation" && c.relation);
    if (relCols.length === 0) return;
    for (const col of relCols) {
      // Collect all row IDs referenced by this column
      const ids = new Set<string>();
      for (const row of db.rows) {
        const val = row.cells[col.id];
        if (Array.isArray(val)) val.forEach((v: string) => ids.add(v));
        else if (val) ids.add(String(val));
      }
      if (ids.size === 0) continue;
      const api = `/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables/${encodeURIComponent(db.id)}/rows/lookup?columnId=${encodeURIComponent(col.id)}&rowIds=${encodeURIComponent([...ids].join(","))}`;
      fetch(api)
        .then((r) => r.json())
        .then((data) => {
          if (data.labels) setRelationLabels((prev) => ({ ...prev, [col.id]: data.labels }));
        })
        .catch(() => {});
    }
  }, [db.columns, db.rows, db.id, spaceSlug]);

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
      setColMenu(null); setColRename(null); setColTypeChange(null); setSelectEditCol(null);
        setColDefaultPanel(null); setRelationConfigCol(null); setLookupConfigCol(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const startEdit = (rowId: string, colId: string, currentValue: unknown) => {
    if (!canWrite) return;
    const col = db.columns.find((c) => c.id === colId);
    if (col?.type === "createdBy" || col?.type === "lookup") return; // read-only
    if (col?.type === "tag") {
      setEditCell({ rowId, colId });
      setTagSearch("");
      setTagCreating(false);
      setTagNewName(""); setTagNewColor(null);
      // Fetch existing space tags
      if (spaceSlug) {
        fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/tags`)
          .then((r) => r.json())
          .then((idx) => setSpaceTags(Object.keys(idx)))
          .catch(() => {});
      }
      return;
    }
    if (col?.type === "relation" && col.relation) {
      setEditCell({ rowId, colId });
      setRelationSearch("");
      // Fetch target table rows for the picker
      setRelationTargetLoading(true);
      const { targetSpace, targetDbId, displayColumnId } = col.relation;
      fetch(`/api/spaces/${encodeURIComponent(targetSpace)}/enhanced-tables/${encodeURIComponent(targetDbId)}`)
        .then((r) => r.json())
        .then((targetDb: EnhancedTable) => {
          const dispCol = displayColumnId
            ? targetDb.columns.find((c) => c.id === displayColumnId)
            : targetDb.columns.find((c) => c.type === "text") || targetDb.columns[0];
          setRelationTargetRows(
            targetDb.rows.map((r) => ({
              id: r.id,
              label: dispCol ? (r.cells[dispCol.id] != null ? String(r.cells[dispCol.id]) : "") : r.id,
            }))
          );
        })
        .catch(() => setRelationTargetRows([]))
        .finally(() => setRelationTargetLoading(false));
      return;
    }
    setEditCell({ rowId, colId });
    setEditValue(currentValue != null ? String(currentValue) : "");
  };

  const commitEdit = useCallback(() => {
    if (tabNavigating.current) return;
    if (!editCell) return;
    const col = db.columns.find((c) => c.id === editCell.colId);
    let val: unknown = editValue;
    if (col?.type === "number") val = editValue === "" ? null : Number(editValue);
    else if (col?.type === "checkbox") val = editValue === "true";
    onUpdateRow(editCell.rowId, { [editCell.colId]: val });
    setEditCell(null);
  }, [editCell, editValue, db.columns, onUpdateRow]);

  // Navigate to next/prev editable cell (shared by all cell types for Tab)
  const tabToNextCell = useCallback((e: React.KeyboardEvent) => {
    if (!editCell) return;
    e.preventDefault();
    tabNavigating.current = true;
    requestAnimationFrame(() => { tabNavigating.current = false; });
    const colIdx = orderedCols.findIndex((c) => c.id === editCell.colId);
    const rowIdx = rows.findIndex((r) => r.id === editCell.rowId);
    let nr = rowIdx, nc = colIdx;
    const step = e.shiftKey ? -1 : 1;
    nc += step;
    if (nc >= orderedCols.length) { nc = 0; nr++; }
    else if (nc < 0) { nc = orderedCols.length - 1; nr--; }
    // Skip read-only columns
    while (nr >= 0 && nr < rows.length && (orderedCols[nc]?.type === "createdBy" || orderedCols[nc]?.type === "lookup")) {
      nc += step;
      if (nc >= orderedCols.length) { nc = 0; nr++; }
      else if (nc < 0) { nc = orderedCols.length - 1; nr--; }
    }
    if (nr >= 0 && nr < rows.length) {
      const nextCol = orderedCols[nc];
      const nextRow = rows[nr];
      setEditCell({ rowId: nextRow.id, colId: nextCol.id });
      setEditValue(nextRow.cells[nextCol.id] != null ? String(nextRow.cells[nextCol.id]) : "");
    } else {
      setEditCell(null);
    }
  }, [editCell, orderedCols, rows]);

  // Keyboard handler for text/number/date inputs
  const handleCellKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { commitEdit(); return; }
    if (e.key === "Escape") { setEditCell(null); return; }
    if (e.key === "Tab" && editCell) {
      // Save current cell value then navigate
      const col = db.columns.find((c) => c.id === editCell.colId);
      let val: unknown = editValue;
      if (col?.type === "number") val = editValue === "" ? null : Number(editValue);
      else if (col?.type === "checkbox") val = editValue === "true";
      onUpdateRow(editCell.rowId, { [editCell.colId]: val });
      tabToNextCell(e);
    }
  }, [editCell, editValue, db.columns, onUpdateRow, commitEdit, tabToNextCell]);

  const allSelected = rows.length > 0 && selectedRows.size === rows.length;
  const someSelected = selectedRows.size > 0 && selectedRows.size < rows.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggleRow = (rowId: string) => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
      return next;
    });
  };

  const handleDuplicateSelected = () => {
    selectedRows.forEach((rowId) => {
      const row = rows.find((r) => r.id === rowId);
      if (row) onAddRow({ ...row.cells });
    });
    setSelectedRows(new Set());
  };

  const handleDeleteSelected = () => {
    selectedRows.forEach((rowId) => onDeleteRow(rowId));
    setSelectedRows(new Set());
  };

  const handleClearSelected = () => {
    const empty = Object.fromEntries(db.columns.map((c) => [c.id, null]));
    selectedRows.forEach((rowId) => onUpdateRow(rowId, empty));
    setSelectedRows(new Set());
  };

  const handleAddColumn = () => {
    onAddColumn({ name: `Field ${db.columns.length + 1}`, type: "text" });
  };

  // Column drag-and-drop reorder
  const [dragColId, setDragColId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ colId: string; side: "left" | "right" } | null>(null);

  const handleColDragStart = (e: React.DragEvent, colId: string) => {
    if (!canWrite) return;
    setDragColId(colId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", colId);
    // Make the ghost slightly transparent
    if (e.currentTarget instanceof HTMLElement) {
      const el = e.currentTarget;
      el.style.opacity = "0.5";
      requestAnimationFrame(() => { el.style.opacity = ""; });
    }
  };

  const handleColDragOver = (e: React.DragEvent, colId: string) => {
    if (!dragColId || dragColId === colId) { setDropTarget(null); return; }
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    // Determine left/right side based on mouse position within the header cell
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midX = rect.left + rect.width / 2;
    const side = e.clientX < midX ? "left" : "right";
    setDropTarget({ colId, side });
  };

  const handleColDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!dragColId || !dropTarget) { setDragColId(null); setDropTarget(null); return; }
    const order = view.columnOrder || db.columns.map((c) => c.id);
    const fromIdx = order.indexOf(dragColId);
    if (fromIdx === -1) { setDragColId(null); setDropTarget(null); return; }
    // Remove the dragged column from the list
    const newOrder = order.filter((id) => id !== dragColId);
    // Find target index in the filtered list
    let toIdx = newOrder.indexOf(dropTarget.colId);
    if (toIdx === -1) { setDragColId(null); setDropTarget(null); return; }
    if (dropTarget.side === "right") toIdx += 1;
    newOrder.splice(toIdx, 0, dragColId);
    onUpdateView({ columnOrder: newOrder });
    setDragColId(null);
    setDropTarget(null);
  };

  const handleColDragEnd = () => {
    setDragColId(null);
    setDropTarget(null);
  };

  // Column resize
  const [resizing, setResizing] = useState<{ colId: string; startX: number; startW: number } | null>(null);
  useEffect(() => {
    if (!resizing) return;
    const onMove = (e: MouseEvent) => {
      const newW = Math.max(60, resizing.startW + e.clientX - resizing.startX);
      onUpdateView({ columnWidths: { ...(view.columnWidths || {}), [resizing.colId]: newW } });
    };
    const onUp = () => setResizing(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [resizing, view.columnWidths, onUpdateView]);

  // Stable row numbers: based on original order in db.rows, not display order
  const rowNumMap = new Map(db.rows.map((r, i) => [r.id, i + 1]));

  const gridCols = "40px " + orderedCols.map((c) => `${getWidth(c)}px`).join(" ") + (canWrite ? " 40px" : "");

  // Bulk edit handler
  const handleBulkEditApply = () => {
    if (!bulkEditColId) return;
    const col = db.columns.find((c) => c.id === bulkEditColId);
    if (!col) return;
    let val: unknown = bulkEditValue;
    if (col.type === "number") val = bulkEditValue === "" ? null : Number(bulkEditValue);
    else if (col.type === "checkbox") val = bulkEditValue === "true";
    selectedRows.forEach((rowId) => onUpdateRow(rowId, { [bulkEditColId]: val }));
    setBulkEditOpen(false);
    setBulkEditColId("");
    setBulkEditValue("");
    setSelectedRows(new Set());
  };

  const renderCell = (row: DbRow, col: DbColumn) => {
    const value = row.cells[col.id];
    const isEditing = editCell?.rowId === row.id && editCell?.colId === col.id;

    if (col.type === "checkbox") {
      return (
        <input
          ref={(el) => { if (isEditing && el) el.focus(); }}
          type="checkbox"
          checked={!!value}
          disabled={!canWrite}
          className="et-cell-checkbox"
          onChange={(e) => onUpdateRow(row.id, { [col.id]: e.target.checked })}
          onKeyDown={(e) => {
            if (e.key === "Tab") tabToNextCell(e);
            else if (e.key === "Escape") setEditCell(null);
          }}
        />
      );
    }

    if (col.type === "select" && isEditing) {
      return (
        <select
          autoFocus
          className="et-cell-input"
          value={String(value || "")}
          onChange={(e) => { onUpdateRow(row.id, { [col.id]: e.target.value }); setEditCell(null); }}
          onBlur={() => { if (!tabNavigating.current) setEditCell(null); }}
          onKeyDown={(e) => {
            if (e.key === "Tab") tabToNextCell(e);
            else if (e.key === "Escape") setEditCell(null);
          }}
        >
          <option value="">—</option>
          {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    if (col.type === "select") {
      const v = String(value || "");
      return v ? <span className="et-cell-tag">{v}</span> : <span className="et-cell-empty">—</span>;
    }

    if (col.type === "multiSelect" && isEditing) {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="et-multiselect-dropdown" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Tab") tabToNextCell(e); else if (e.key === "Escape") setEditCell(null); }}>
          {(col.options || []).map((o) => (
            <label key={o} className="et-multiselect-option">
              <input
                type="checkbox"
                checked={vals.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked ? [...vals, o] : vals.filter((v) => v !== o);
                  onUpdateRow(row.id, { [col.id]: next });
                }}
              />
              <span>{o}</span>
            </label>
          ))}
          <button className="et-multiselect-done" onClick={() => setEditCell(null)}>Done</button>
        </div>
      );
    }

    if (col.type === "multiSelect") {
      const vals = Array.isArray(value) ? value : [];
      return vals.length > 0
        ? <div className="et-cell-tags">{vals.map((v: string) => <span key={v} className="et-cell-tag">{v}</span>)}</div>
        : <span className="et-cell-empty">—</span>;
    }

    if (col.type === "createdBy") {
      const username = value ? String(value) : "";
      const member = members.find((m) => m.username === username);
      return username
        ? <span className="et-member-chip">{member?.fullName || username}</span>
        : <span className="et-cell-empty">—</span>;
    }

    if (col.type === "member") {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      if (isEditing) {
        return (
          <div className="et-multiselect-dropdown" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Tab") tabToNextCell(e); else if (e.key === "Escape") setEditCell(null); }}>
            {members.map((m) => (
              <label key={m.username} className="et-multiselect-option">
                <input
                  type="checkbox"
                  checked={vals.includes(m.username)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...vals, m.username] : vals.filter((v) => v !== m.username);
                    onUpdateRow(row.id, { [col.id]: next });
                  }}
                />
                <span>{m.fullName || m.username}</span>
              </label>
            ))}
            <button className="et-multiselect-done" onClick={() => setEditCell(null)}>Done</button>
          </div>
        );
      }
      return vals.length > 0
        ? <div className="et-cell-tags">{vals.map((u) => { const m = members.find((x) => x.username === u); return <span key={u} className="et-member-chip">{m?.fullName || u}</span>; })}</div>
        : <span className="et-cell-empty">—</span>;
    }

    // ── Relation cell ──────────────────────────────────────────────────
    if (col.type === "relation" && col.relation) {
      const linkedIds = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
      const labels = relationLabels[col.id] || {};
      const isOne = col.relation.limit === "one";

      if (isEditing) {
        const filtered = relationSearch
          ? relationTargetRows.filter((r) => r.label.toLowerCase().includes(relationSearch.toLowerCase()))
          : relationTargetRows;
        return (
          <div className="et-relation-dropdown" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") setEditCell(null); }}>
            <div className="et-relation-search-wrap">
              <Search className="w-3 h-3 text-text-muted" />
              <input
                autoFocus
                className="et-relation-search"
                placeholder="Search…"
                value={relationSearch}
                onChange={(e) => setRelationSearch(e.target.value)}
              />
            </div>
            {relationTargetLoading ? (
              <div className="et-relation-loading">Loading…</div>
            ) : (
              <div className="et-relation-list">
                {filtered.map((tr) => {
                  const checked = linkedIds.includes(tr.id);
                  return (
                    <label key={tr.id} className="et-multiselect-option">
                      <input
                        type={isOne ? "radio" : "checkbox"}
                        name={`rel-${col.id}-${row.id}`}
                        checked={checked}
                        onChange={() => {
                          let next: string | string[] | null;
                          if (isOne) {
                            next = checked ? null : tr.id;
                          } else {
                            next = checked ? linkedIds.filter((id) => id !== tr.id) : [...linkedIds, tr.id];
                          }
                          onUpdateRow(row.id, { [col.id]: next });
                          // Update label cache immediately
                          setRelationLabels((prev) => ({ ...prev, [col.id]: { ...prev[col.id], [tr.id]: tr.label } }));
                          if (isOne) setEditCell(null);
                        }}
                      />
                      <span>{tr.label || tr.id}</span>
                    </label>
                  );
                })}
                {filtered.length === 0 && <div className="et-relation-empty">No rows found</div>}
              </div>
            )}
            {!isOne && <button className="et-multiselect-done" onClick={() => setEditCell(null)}>Done</button>}
          </div>
        );
      }

      // Display mode: clickable chips that navigate to target table
      if (linkedIds.length === 0) return <span className="et-cell-empty">—</span>;
      const canNavigate = onOpenDatabase && col.relation.targetSpace === spaceSlug;
      return (
        <div className="et-cell-tags">
          {linkedIds.map((id) => (
            <button
              key={id}
              className="et-cell-tag et-relation-chip et-relation-chip-link"
              onClick={(e) => {
                e.stopPropagation();
                if (canNavigate) {
                  onOpenDatabase(col.relation!.targetDbId, labels[id] || "");
                }
              }}
              title={canNavigate ? `Open in ${col.relation!.targetDbId}` : "Linked record (cross-space)"}
            >
              <Link2 className="w-3 h-3 inline mr-0.5" />
              {labels[id] || id}
            </button>
          ))}
        </div>
      );
    }

    // ── Tag cell ────────────────────────────────────────────────────────
    if (col.type === "tag") {
      const vals = Array.isArray(value) ? (value as string[]) : [];

      if (isEditing) {
        const filtered = tagSearch
          ? spaceTags.filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()) && !vals.includes(t)).slice(0, 10)
          : spaceTags.filter((t) => !vals.includes(t)).slice(0, 10);
        const showCreateOption = tagSearch.trim() && !spaceTags.includes(tagSearch.trim().toLowerCase());

        return (
          <div className="et-tag-dropdown" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape") { setEditCell(null); setTagCreating(false); } }}>
            {!tagCreating ? (
              <>
                <div className="et-relation-search-wrap">
                  <Search className="w-3 h-3 text-text-muted" />
                  <input
                    autoFocus
                    className="et-relation-search"
                    placeholder="Search tags…"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagSearch.trim()) {
                        const clean = tagSearch.trim().toLowerCase().replace(/[^a-z0-9_/-]/g, "");
                        if (clean && !vals.includes(clean)) {
                          onUpdateRow(row.id, { [col.id]: [...vals, clean] });
                          if (!spaceTags.includes(clean)) setSpaceTags((prev) => [...prev, clean]);
                        }
                        setTagSearch("");
                      }
                    }}
                  />
                </div>
                {/* Already-selected tags with remove buttons */}
                {vals.length > 0 && (
                  <div className="et-tag-selected">
                    {vals.map((t) => {
                      const tc = localTagColors[t];
                      return (
                        <span key={t} className="et-tag-chip" style={tc ? { background: tc, color: tagContrastText(tc) } : undefined}>
                          #{t}
                          <button
                            className="et-tag-chip-remove"
                            style={tc ? { color: tagContrastText(tc) } : undefined}
                            onClick={() => onUpdateRow(row.id, { [col.id]: vals.filter((v) => v !== t) })}
                          >×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
                <div className="et-relation-list">
                  {filtered.map((t) => {
                    const tc = localTagColors[t];
                    return (
                      <button key={t} className="et-tag-option" onClick={() => {
                        onUpdateRow(row.id, { [col.id]: [...vals, t] });
                        setTagSearch("");
                      }}>
                        <span className="et-tag-dot" style={tc ? { background: tc } : undefined}><Hash className="w-2.5 h-2.5" /></span>
                        {t}
                      </button>
                    );
                  })}
                  {showCreateOption && (
                    <button className="et-tag-create-btn" onClick={() => {
                      setTagNewName(tagSearch.trim().toLowerCase().replace(/[^a-z0-9_/-]/g, ""));
                      setTagNewColor(null);
                      setTagCreating(true);
                    }}>
                      <Plus className="w-3 h-3" /> Create "{tagSearch.trim()}"
                    </button>
                  )}
                </div>
                <button className="et-multiselect-done" onClick={() => setEditCell(null)}>Done</button>
              </>
            ) : (
              /* Create new tag popover with color picker */
              <div className="et-tag-create-panel">
                <div className="et-tag-create-header">Create new tag</div>
                <input
                  autoFocus
                  className="et-col-menu-input"
                  placeholder="Tag name"
                  value={tagNewName}
                  onChange={(e) => setTagNewName(e.target.value.toLowerCase().replace(/[^a-z0-9_/-]/g, ""))}
                />
                <div className="et-tag-create-header" style={{ marginTop: 6 }}>Color</div>
                <div className="et-tag-color-grid">
                  <button
                    className={`et-tag-color-swatch${tagNewColor === null ? " active" : ""}`}
                    style={{ background: "var(--color-muted)" }}
                    onClick={() => setTagNewColor(null)}
                    title="No color"
                  />
                  {TAG_PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`et-tag-color-swatch${tagNewColor === c ? " active" : ""}`}
                      style={{ background: c }}
                      onClick={() => setTagNewColor(c)}
                    />
                  ))}
                </div>
                <div className="et-tag-create-actions">
                  <button className="et-tag-create-cancel" onClick={() => setTagCreating(false)}>Cancel</button>
                  <button className="et-tag-create-save" onClick={async () => {
                    const clean = tagNewName.trim();
                    if (!clean) return;
                    // Add tag to cell
                    if (!vals.includes(clean)) {
                      onUpdateRow(row.id, { [col.id]: [...vals, clean] });
                    }
                    if (!spaceTags.includes(clean)) setSpaceTags((prev) => [...prev, clean]);
                    // Save color if set
                    if (tagNewColor && spaceSlug) {
                      setLocalTagColors((prev) => ({ ...prev, [clean]: tagNewColor }));
                      await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/customization`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ tagColors: { [clean]: tagNewColor } }),
                      });
                    }
                    setTagCreating(false);
                    setTagSearch("");
                  }}>Create</button>
                </div>
              </div>
            )}
          </div>
        );
      }

      // Display mode: colored tag chips — clickable to filter
      if (vals.length === 0) return <span className="et-cell-empty">—</span>;
      return (
        <div className="et-cell-tags">
          {vals.map((t) => {
            const tc = localTagColors[t];
            return (
              <button
                key={t}
                className="et-tag-chip et-tag-chip-link"
                style={tc ? { background: tc, color: tagContrastText(tc) } : undefined}
                onClick={(e) => { e.stopPropagation(); if (onSearch) onSearch(t); }}
                title={`Filter by #${t}`}
              >
                #{t}
              </button>
            );
          })}
        </div>
      );
    }

    // ── Lookup cell (read-only) ────────────────────────────────────────
    if (col.type === "lookup" && col.lookup) {
      const computed = row.cells[col.id];
      if (computed == null || computed === "") return <span className="et-cell-empty">—</span>;
      if (Array.isArray(computed)) {
        return <span className="et-cell-text">{computed.join(", ")}</span>;
      }
      return <span className="et-cell-text">{String(computed)}</span>;
    }

    if (isEditing) {
      return (
        <input
          autoFocus
          className="et-cell-input"
          type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleCellKeyDown}
        />
      );
    }

    if (col.type === "url" && value) {
      return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="et-cell-link">{String(value)}</a>;
    }

    const display = value != null && value !== "" ? String(value) : "";
    return display ? <span className="et-cell-text">{display}</span> : <span className="et-cell-empty">—</span>;
  };

  return (
    <>
    <div className="et-table-wrap">
      <div className="et-table" style={{ gridTemplateColumns: gridCols }}>
        {/* Header */}
        <div className="et-th et-th-rownum">
          <input
            ref={selectAllRef}
            type="checkbox"
            className="et-select-all-check"
            checked={allSelected}
            onChange={() => setSelectedRows(allSelected || someSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          />
        </div>
        {orderedCols.map((col) => {
          const currentSort = view.sorts.find((s) => s.columnId === col.id);
          const handleHeaderClick = () => {
            let newSorts: typeof view.sorts;
            if (!currentSort) {
              newSorts = [{ columnId: col.id, dir: "asc" }];
            } else if (currentSort.dir === "asc") {
              newSorts = view.sorts.map((s) => s.columnId === col.id ? { ...s, dir: "desc" as const } : s);
            } else {
              newSorts = view.sorts.filter((s) => s.columnId !== col.id);
            }
            onUpdateView({ sorts: newSorts });
          };
          return (
          <div
            key={col.id}
            className={`et-th${currentSort ? " et-th-sorted" : ""}${dragColId === col.id ? " et-th-dragging" : ""}${dropTarget?.colId === col.id ? ` et-th-drop-${dropTarget.side}` : ""}`}
            style={{ position: "relative" }}
            draggable={canWrite}
            onDragStart={(e) => handleColDragStart(e, col.id)}
            onDragOver={(e) => handleColDragOver(e, col.id)}
            onDrop={handleColDrop}
            onDragEnd={handleColDragEnd}
            onDragLeave={() => { if (dropTarget?.colId === col.id) setDropTarget(null); }}
          >
            {canWrite && <GripVertical className="et-th-grip" />}
            <span className="et-th-name et-th-name-sortable" onClick={handleHeaderClick}>
              {col.name}
              {currentSort && (
                <span className="et-th-sort-icon">
                  {currentSort.dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                </span>
              )}
            </span>
            {canWrite && (
              <button className="et-th-menu-btn" onClick={() => setColMenu(colMenu === col.id ? null : col.id)}>
                <MoreVertical className="w-3 h-3" />
              </button>
            )}
            {canWrite && (
              <div
                className="et-th-resize"
                onMouseDown={(e) => { e.preventDefault(); setResizing({ colId: col.id, startX: e.clientX, startW: getWidth(col) }); }}
              />
            )}
            {colMenu === col.id && (
              <div className="et-col-menu" ref={colMenuRef}>
                {colRename?.colId === col.id ? (
                  <div className="et-col-menu-rename">
                    <input
                      autoFocus
                      className="et-col-menu-input"
                      value={colRename.name}
                      onChange={(e) => setColRename({ ...colRename, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && colRename.name.trim()) { onUpdateColumn(col.id, { name: colRename.name.trim() }); setColRename(null); setColMenu(null); }
                        if (e.key === "Escape") setColRename(null);
                      }}
                      onBlur={() => { if (colRename.name.trim()) onUpdateColumn(col.id, { name: colRename.name.trim() }); setColRename(null); }}
                    />
                  </div>
                ) : colTypeChange === col.id ? (
                  <div className="et-col-menu-types">
                    {COLUMN_TYPES.map((t) => (
                      <button key={t.value} className={`et-col-menu-type-btn${col.type === t.value ? " active" : ""}`}
                        onClick={() => {
                          onUpdateColumn(col.id, { type: t.value });
                          setColTypeChange(null);
                          setColMenu(null);
                        }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                ) : selectEditCol === col.id ? (
                  <div className="et-col-menu-rename">
                    <textarea
                      autoFocus
                      className="et-col-menu-input"
                      placeholder="Option1, Option2, ..."
                      value={selectOptions}
                      onChange={(e) => setSelectOptions(e.target.value)}
                      rows={3}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          const opts = selectOptions.split(",").map((s) => s.trim()).filter(Boolean);
                          onUpdateColumn(col.id, { options: opts });
                          setSelectEditCol(null); setColMenu(null);
                        }
                      }}
                    />
                    <div className="text-[10px] text-text-muted mt-1">Comma-separated. Enter to save.</div>
                  </div>
                ) : relationConfigCol === col.id ? (
                  <div className="et-col-default-panel">
                    <div className="et-col-menu-item" style={{ opacity: 0.5, fontSize: "0.65rem", cursor: "default" }}>Configure Relation</div>
                    <label className="et-col-default-label">
                      Space
                      <select className="et-col-menu-input" value={relSelectedSpace} onChange={(e) => {
                        setRelSelectedSpace(e.target.value);
                        setRelSelectedDb("");
                        setRelSelectedDisplayCol("");
                        setRelTables([]);
                        if (e.target.value) {
                          fetch(`/api/spaces/${encodeURIComponent(e.target.value)}/enhanced-tables`)
                            .then((r) => r.json())
                            .then((tables: EnhancedTable[]) => setRelTables(tables.map((t) => ({ id: t.id, title: t.title, columns: t.columns.map((c) => ({ id: c.id, name: c.name, type: c.type })) }))))
                            .catch(() => {});
                        }
                      }}>
                        <option value="">Select space…</option>
                        {relSpaces.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
                      </select>
                    </label>
                    {relSelectedSpace && (
                      <label className="et-col-default-label">
                        Table
                        <select className="et-col-menu-input" value={relSelectedDb} onChange={(e) => {
                          setRelSelectedDb(e.target.value);
                          setRelSelectedDisplayCol("");
                        }}>
                          <option value="">Select table…</option>
                          {relTables.filter((t) => t.id !== db.id || relSelectedSpace !== spaceSlug).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                        </select>
                      </label>
                    )}
                    {relSelectedDb && (() => {
                      const targetTable = relTables.find((t) => t.id === relSelectedDb);
                      const targetCols = targetTable?.columns || [];
                      return (
                        <>
                          <label className="et-col-default-label">
                            Display column
                            <select className="et-col-menu-input" value={relSelectedDisplayCol} onChange={(e) => setRelSelectedDisplayCol(e.target.value)}>
                              <option value="">(Auto – first text)</option>
                              {targetCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </label>
                          <label className="et-col-default-label">
                            <input type="checkbox" checked={relLimit === "many"} onChange={(e) => setRelLimit(e.target.checked ? "many" : "one")} />
                            Allow multiple links
                          </label>
                          <label className="et-col-default-label">
                            <input type="checkbox" checked={relBidirectional} onChange={(e) => setRelBidirectional(e.target.checked)} />
                            Create reverse column
                          </label>
                          <button className="et-col-menu-item" style={{ marginTop: 4, fontWeight: 600 }} onClick={() => {
                            onUpdateColumn(col.id, {
                              type: "relation",
                              relation: {
                                targetSpace: relSelectedSpace,
                                targetDbId: relSelectedDb,
                                displayColumnId: relSelectedDisplayCol || undefined,
                                limit: relLimit,
                                bidirectional: relBidirectional,
                              },
                            });
                            setRelationConfigCol(null);
                            setColMenu(null);
                          }}>Save</button>
                        </>
                      );
                    })()}
                    <button className="et-col-menu-item" style={{ marginTop: 4 }} onClick={() => setRelationConfigCol(null)}>← Back</button>
                  </div>
                ) : lookupConfigCol === col.id ? (
                  <div className="et-col-default-panel">
                    <div className="et-col-menu-item" style={{ opacity: 0.5, fontSize: "0.65rem", cursor: "default" }}>Configure Lookup</div>
                    <label className="et-col-default-label">
                      Relation column
                      <select className="et-col-menu-input" value={lookupRelCol} onChange={(e) => {
                        setLookupRelCol(e.target.value);
                        setLookupTargetCol("");
                        setLookupTargetCols([]);
                        const relCol = db.columns.find((c) => c.id === e.target.value);
                        if (relCol?.relation) {
                          fetch(`/api/spaces/${encodeURIComponent(relCol.relation.targetSpace)}/enhanced-tables/${encodeURIComponent(relCol.relation.targetDbId)}`)
                            .then((r) => r.json())
                            .then((targetDb: EnhancedTable) => setLookupTargetCols(targetDb.columns.map((c) => ({ id: c.id, name: c.name }))))
                            .catch(() => {});
                        }
                      }}>
                        <option value="">Select relation…</option>
                        {db.columns.filter((c) => c.type === "relation" && c.relation).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </label>
                    {lookupRelCol && lookupTargetCols.length > 0 && (
                      <>
                        <label className="et-col-default-label">
                          Target column
                          <select className="et-col-menu-input" value={lookupTargetCol} onChange={(e) => setLookupTargetCol(e.target.value)}>
                            <option value="">Select column…</option>
                            {lookupTargetCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </label>
                        <label className="et-col-default-label">
                          Aggregation
                          <select className="et-col-menu-input" value={lookupAggregate} onChange={(e) => setLookupAggregate(e.target.value as DbLookupAggregate)}>
                            {LOOKUP_AGGREGATES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                          </select>
                        </label>
                        <button className="et-col-menu-item" style={{ marginTop: 4, fontWeight: 600 }} onClick={() => {
                          onUpdateColumn(col.id, {
                            type: "lookup",
                            lookup: {
                              relationColumnId: lookupRelCol,
                              targetColumnId: lookupTargetCol,
                              aggregate: lookupAggregate,
                            },
                          });
                          setLookupConfigCol(null);
                          setColMenu(null);
                        }}>Save</button>
                      </>
                    )}
                    <button className="et-col-menu-item" style={{ marginTop: 4 }} onClick={() => setLookupConfigCol(null)}>← Back</button>
                  </div>
                ) : colDefaultPanel === col.id ? (
                  <div className="et-col-default-panel">
                    <div className="et-col-menu-item" style={{ opacity: 0.5, fontSize: "0.65rem", cursor: "default" }}>Default value</div>
                    {col.type === "date" && (
                      <label className="et-col-default-label">
                        <input type="checkbox" checked={!!col.defaultCurrentDate}
                          onChange={(e) => onUpdateColumn(col.id, { defaultCurrentDate: e.target.checked, defaultValue: undefined })} />
                        Use today's date
                      </label>
                    )}
                    {col.type === "checkbox" && (
                      <label className="et-col-default-label">
                        <input type="checkbox" checked={!!col.defaultValue}
                          onChange={(e) => onUpdateColumn(col.id, { defaultValue: e.target.checked })} />
                        Checked by default
                      </label>
                    )}
                    {(col.type === "select" || col.type === "multiSelect") && (col.options || []).map((opt) => (
                      <label key={opt} className="et-col-default-label">
                        <input
                          type={col.type === "select" ? "radio" : "checkbox"}
                          name={`dflt-${col.id}`}
                          checked={col.type === "select"
                            ? col.defaultValue === opt
                            : Array.isArray(col.defaultValue) && (col.defaultValue as string[]).includes(opt)}
                          onChange={(e) => {
                            if (col.type === "select") {
                              onUpdateColumn(col.id, { defaultValue: e.target.checked ? opt : null });
                            } else {
                              const cur = Array.isArray(col.defaultValue) ? (col.defaultValue as string[]) : [];
                              onUpdateColumn(col.id, { defaultValue: e.target.checked ? [...cur, opt] : cur.filter((v) => v !== opt) });
                            }
                          }}
                        />
                        {opt}
                      </label>
                    ))}
                    {col.type === "member" && members.map((m) => (
                      <label key={m.username} className="et-col-default-label">
                        <input
                          type="checkbox"
                          checked={Array.isArray(col.defaultValue) && (col.defaultValue as string[]).includes(m.username)}
                          onChange={(e) => {
                            const cur = Array.isArray(col.defaultValue) ? (col.defaultValue as string[]) : [];
                            onUpdateColumn(col.id, { defaultValue: e.target.checked ? [...cur, m.username] : cur.filter((v) => v !== m.username) });
                          }}
                        />
                        {m.fullName || m.username}
                      </label>
                    ))}
                    <button className="et-col-menu-item" style={{ marginTop: 4 }} onClick={() => setColDefaultPanel(null)}>← Back</button>
                  </div>
                ) : (
                  <>
                    <button className="et-col-menu-item" onClick={() => setColRename({ colId: col.id, name: col.name })}>Rename</button>
                    <button className="et-col-menu-item" onClick={() => setColTypeChange(col.id)}>Change type</button>
                    {(col.type === "select" || col.type === "multiSelect") && (
                      <button className="et-col-menu-item" onClick={() => { setSelectEditCol(col.id); setSelectOptions((col.options || []).join(", ")); }}>Edit options</button>
                    )}
                    {(col.type === "select" || col.type === "multiSelect" || col.type === "date" || col.type === "checkbox" || col.type === "member") && (
                      <button className="et-col-menu-item" onClick={() => setColDefaultPanel(col.id)}>Set default…</button>
                    )}
                    {col.type === "relation" && (
                      <button className="et-col-menu-item" onClick={() => {
                        // Pre-populate config from existing relation
                        if (col.relation) {
                          setRelSelectedSpace(col.relation.targetSpace);
                          setRelSelectedDb(col.relation.targetDbId);
                          setRelSelectedDisplayCol(col.relation.displayColumnId || "");
                          setRelLimit(col.relation.limit);
                          setRelBidirectional(col.relation.bidirectional || false);
                          // Fetch tables for the pre-selected space
                          fetch(`/api/spaces/${encodeURIComponent(col.relation.targetSpace)}/enhanced-tables`)
                            .then((r) => r.json())
                            .then((tables: EnhancedTable[]) => setRelTables(tables.map((t) => ({ id: t.id, title: t.title, columns: t.columns.map((c) => ({ id: c.id, name: c.name, type: c.type })) }))))
                            .catch(() => {});
                        } else {
                          setRelSelectedSpace(spaceSlug || "");
                          setRelSelectedDb(""); setRelSelectedDisplayCol(""); setRelLimit("many"); setRelBidirectional(false);
                          if (spaceSlug) {
                            fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables`)
                              .then((r) => r.json())
                              .then((tables: EnhancedTable[]) => setRelTables(tables.map((t) => ({ id: t.id, title: t.title, columns: t.columns.map((c) => ({ id: c.id, name: c.name, type: c.type })) }))))
                              .catch(() => {});
                          }
                        }
                        // Fetch spaces list
                        fetch("/api/spaces")
                          .then((r) => r.json())
                          .then((spaces: { slug: string; name: string }[]) => setRelSpaces(spaces))
                          .catch(() => {});
                        setRelationConfigCol(col.id);
                      }}>Configure relation…</button>
                    )}
                    {col.type === "lookup" && (
                      <button className="et-col-menu-item" onClick={() => {
                        if (col.lookup) {
                          setLookupRelCol(col.lookup.relationColumnId);
                          setLookupTargetCol(col.lookup.targetColumnId);
                          setLookupAggregate(col.lookup.aggregate || "list");
                          // Fetch target columns
                          const relCol = db.columns.find((c) => c.id === col.lookup!.relationColumnId);
                          if (relCol?.relation) {
                            fetch(`/api/spaces/${encodeURIComponent(relCol.relation.targetSpace)}/enhanced-tables/${encodeURIComponent(relCol.relation.targetDbId)}`)
                              .then((r) => r.json())
                              .then((targetDb: EnhancedTable) => setLookupTargetCols(targetDb.columns.map((c) => ({ id: c.id, name: c.name }))))
                              .catch(() => {});
                          }
                        } else {
                          setLookupRelCol(""); setLookupTargetCol(""); setLookupAggregate("list"); setLookupTargetCols([]);
                        }
                        setLookupConfigCol(col.id);
                      }}>Configure lookup…</button>
                    )}
                    <button className="et-col-menu-item" onClick={() => {
                      const hidden = [...(view.hiddenColumns || []), col.id];
                      onUpdateView({ hiddenColumns: hidden });
                      setColMenu(null);
                    }}>Hide column</button>
                    <div className="et-col-menu-sep" />
                    <button className="et-col-menu-item danger" onClick={() => { onDeleteColumn(col.id); setColMenu(null); }}>Delete column</button>
                  </>
                )}
              </div>
            )}
          </div>
          );
        })}
        {canWrite && (
          <div className="et-th et-th-add" style={{ cursor: "pointer" }} onClick={handleAddColumn}>
            <Plus className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Rows */}
        {rows.map((row, rowIdx) => {
          const isSelected = selectedRows.has(row.id);
          return (
          <div key={row.id} className="et-row contents">
            <div
              className={`et-td et-td-rownum${isSelected ? " is-selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleRow(row.id); }}
            >
              <button
                className="et-row-edit-btn"
                onClick={(e) => { e.stopPropagation(); setEditModalRowId(row.id); }}
                title="Edit row"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <span className="et-rownum-num">{rowNumMap.get(row.id) ?? rowIdx + 1}</span>
              <input
                type="checkbox"
                className="et-rownum-check"
                checked={isSelected}
                onChange={() => toggleRow(row.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {orderedCols.map((col) => {
              // Apply conditional formatting
              const cfStyles: React.CSSProperties = {};
              for (const cf of (view.conditionalFormats || [])) {
                if (matchesCfRule(row, cf, db.columns)) {
                  if (cf.style.bg) cfStyles.background = cf.style.bg;
                  if (cf.style.color) cfStyles.color = cf.style.color;
                  if (cf.style.bold) cfStyles.fontWeight = 700;
                  if (cf.style.italic) cfStyles.fontStyle = "italic";
                }
              }
              return (
                <div
                  key={col.id}
                  className={`et-td${isSelected ? " is-selected" : ""}`}
                  style={Object.keys(cfStyles).length > 0 ? cfStyles : undefined}
                  onClick={() => startEdit(row.id, col.id, row.cells[col.id])}
                >
                  {renderCell(row, col)}
                </div>
              );
            })}
            {canWrite && (
              <div className={`et-td et-td-actions${isSelected ? " is-selected" : ""}`}>
                <button className="et-row-delete" onClick={() => onDeleteRow(row.id)} title="Delete row">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>

      {/* Add row / column buttons — outside et-table-wrap so the dropdown isn't clipped */}
      {canWrite && (
        <div className="et-table-footer">
          <button className="et-add-row" onClick={() => onAddRow()}>
            <Plus className="w-3.5 h-3.5" /> New row
          </button>
          <button className="et-add-col" onClick={handleAddColumn}>
            <Plus className="w-3.5 h-3.5" /> Add column
          </button>
        </div>
      )}
      {/* Selection action bar */}
      {selectedRows.size > 0 && (
        <div className="et-selection-bar">
          <span className="et-selection-count">{selectedRows.size} selected</span>
          <div className="et-selection-sep" />
          {canWrite && (
            <button className="et-selection-btn" onClick={() => { setBulkEditOpen(true); setBulkEditColId(""); setBulkEditValue(""); }}>
              <Edit3 className="w-3.5 h-3.5" /> Bulk Edit
            </button>
          )}
          <button className="et-selection-btn" onClick={handleDuplicateSelected}>
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button className="et-selection-btn" onClick={handleClearSelected}>
            <Eraser className="w-3.5 h-3.5" /> Clear values
          </button>
          <div className="et-selection-sep" />
          <button className="et-selection-btn danger" onClick={handleDeleteSelected}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button className="et-selection-dismiss" onClick={() => setSelectedRows(new Set())} title="Deselect all">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bulk edit popover */}
      {bulkEditOpen && (
        <div className="et-bulk-edit-overlay" onClick={() => setBulkEditOpen(false)}>
          <div className="et-bulk-edit-panel" onClick={(e) => e.stopPropagation()}>
            <div className="et-bulk-edit-header">Bulk Edit {selectedRows.size} rows</div>
            <select className="qb-select" value={bulkEditColId} onChange={(e) => { setBulkEditColId(e.target.value); setBulkEditValue(""); }}>
              <option value="">Select column…</option>
              {db.columns.filter((c) => c.type !== "createdBy" && c.type !== "formula" && c.type !== "lookup").map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {bulkEditColId && (() => {
              const col = db.columns.find((c) => c.id === bulkEditColId);
              if (!col) return null;
              if (col.type === "select") {
                return <select className="qb-select" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)}>
                  <option value="">—</option>
                  {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>;
              }
              if (col.type === "checkbox") {
                return <select className="qb-select" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)}>
                  <option value="true">Checked</option>
                  <option value="false">Unchecked</option>
                </select>;
              }
              if (col.type === "date") return <input className="qb-input" type="date" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)} />;
              if (col.type === "number") return <input className="qb-input" type="number" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)} />;
              return <input className="qb-input" type="text" value={bulkEditValue} onChange={(e) => setBulkEditValue(e.target.value)} placeholder="New value" />;
            })()}
            <div className="et-bulk-edit-actions">
              <button className="rem-btn rem-btn-secondary" onClick={() => setBulkEditOpen(false)}>Cancel</button>
              <button className="qb-save-btn" onClick={handleBulkEditApply} disabled={!bulkEditColId}>Apply</button>
            </div>
          </div>
        </div>
      )}

      {/* Row edit modal */}
      {editModalRowId && (() => {
        const editRow = db.rows.find((r) => r.id === editModalRowId);
        if (!editRow) return null;
        return (
          <RowEditModal
            db={db}
            row={editRow}
            hiddenColumnIds={view.hiddenColumns || []}
            canWrite={canWrite}
            members={members}
            spaceSlug={spaceSlug}
            tagColors={tagColors}
            relationLabels={relationLabels}
            onUpdateRow={onUpdateRow}
            onDeleteRow={(id) => { onDeleteRow(id); setEditModalRowId(null); }}
            onDuplicateRow={(cells) => { onAddRow(cells); }}
            onClose={() => setEditModalRowId(null)}
          />
        );
      })()}
    </>
  );
}
