"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, Trash2, MoreVertical, GripVertical, Copy, Eraser, X } from "lucide-react";
import type { Database, DbColumn, DbRow, DbView, DbColumnType } from "@/lib/types";

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
];

interface Props {
  db: Database;
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
  allDatabases?: { id: string; title: string }[];
  onNavigateToRelation?: (dbId: string, rowId: string, label: string) => void;
}

export default function DatabaseTable({
  db, view, rows, canWrite,
  onAddRow, onUpdateRow, onDeleteRow,
  onAddColumn, onUpdateColumn, onDeleteColumn, onUpdateView,
  currentUser, members = [], spaceSlug, allDatabases = [], onNavigateToRelation,
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
  const [colRelationPanel, setColRelationPanel] = useState<string | null>(null);
  const [relatedDbRows, setRelatedDbRows] = useState<Record<string, DbRow[] | null>>({});
  const fetchingRelated = useRef<Set<string>>(new Set());
  const colMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Column ordering
  const orderedCols = (() => {
    const order = view.columnOrder || db.columns.map((c) => c.id);
    const hidden = new Set(view.hiddenColumns || []);
    return order
      .map((id) => db.columns.find((c) => c.id === id))
      .filter((c): c is DbColumn => !!c && !hidden.has(c.id));
  })();

  const getWidth = (col: DbColumn) => view.columnWidths?.[col.id] || col.width || 150;

  // Close menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenu(null); setColRename(null); setColTypeChange(null); setSelectEditCol(null);
        setColDefaultPanel(null); setColRelationPanel(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const startEdit = (rowId: string, colId: string, currentValue: unknown) => {
    if (!canWrite) return;
    const col = db.columns.find((c) => c.id === colId);
    if (col?.type === "createdBy") return; // auto-filled, read-only
    setEditCell({ rowId, colId });
    setEditValue(currentValue != null ? String(currentValue) : "");
  };

  const commitEdit = useCallback(() => {
    if (!editCell) return;
    const col = db.columns.find((c) => c.id === editCell.colId);
    let val: unknown = editValue;
    if (col?.type === "number") val = editValue === "" ? null : Number(editValue);
    else if (col?.type === "checkbox") val = editValue === "true";
    onUpdateRow(editCell.rowId, { [editCell.colId]: val });
    setEditCell(null);
  }, [editCell, editValue, db.columns, onUpdateRow]);

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

  // Lazy-fetch rows from a related database for relation cells
  const fetchRelatedDbRows = useCallback(async (dbId: string) => {
    if (!spaceSlug || fetchingRelated.current.has(dbId)) return;
    fetchingRelated.current.add(dbId);
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/databases/${encodeURIComponent(dbId)}`);
      if (res.ok) {
        const data = await res.json();
        setRelatedDbRows((prev) => ({ ...prev, [dbId]: data.rows || [] }));
      }
    } catch { /* ignore */ }
  }, [spaceSlug]);

  // Eagerly fetch related DB rows for all relation columns (so chips show labels, not IDs)
  useEffect(() => {
    db.columns.filter((c) => c.type === "relation" && c.relationDbId)
      .forEach((c) => fetchRelatedDbRows(c.relationDbId!));
  }, [db.columns, fetchRelatedDbRows]);

  // Trigger fetch when a relation cell is opened for editing
  useEffect(() => {
    if (!editCell) return;
    const col = db.columns.find((c) => c.id === editCell.colId);
    if (col?.type === "relation" && col.relationDbId) fetchRelatedDbRows(col.relationDbId);
  }, [editCell, db.columns, fetchRelatedDbRows]);

  const getRowLabel = (rowId: string, dbId: string): string => {
    const dbRows = relatedDbRows[dbId];
    if (!dbRows) return rowId.slice(0, 8);
    const row = dbRows.find((r) => r.id === rowId);
    if (!row) return rowId.slice(0, 8);
    const firstText = Object.values(row.cells).find((v) => v != null && v !== "" && typeof v === "string");
    return firstText ? String(firstText) : `Row ${rowId.slice(0, 6)}`;
  };

  const handleAddColumn = () => {
    onAddColumn({ name: `Field ${db.columns.length + 1}`, type: "text" });
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

  const gridCols = "40px " + orderedCols.map((c) => `${getWidth(c)}px`).join(" ") + (canWrite ? " 40px" : "");

  const renderCell = (row: DbRow, col: DbColumn) => {
    const value = row.cells[col.id];
    const isEditing = editCell?.rowId === row.id && editCell?.colId === col.id;

    if (col.type === "checkbox") {
      return (
        <input
          type="checkbox"
          checked={!!value}
          disabled={!canWrite}
          className="db-cell-checkbox"
          onChange={(e) => onUpdateRow(row.id, { [col.id]: e.target.checked })}
        />
      );
    }

    if (col.type === "select" && isEditing) {
      return (
        <select
          autoFocus
          className="db-cell-input"
          value={String(value || "")}
          onChange={(e) => { onUpdateRow(row.id, { [col.id]: e.target.value }); setEditCell(null); }}
          onBlur={() => setEditCell(null)}
        >
          <option value="">—</option>
          {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    if (col.type === "select") {
      const v = String(value || "");
      return v ? <span className="db-cell-tag">{v}</span> : <span className="db-cell-empty">—</span>;
    }

    if (col.type === "multiSelect" && isEditing) {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="db-multiselect-dropdown" onClick={(e) => e.stopPropagation()}>
          {(col.options || []).map((o) => (
            <label key={o} className="db-multiselect-option">
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
          <button className="db-multiselect-done" onClick={() => setEditCell(null)}>Done</button>
        </div>
      );
    }

    if (col.type === "multiSelect") {
      const vals = Array.isArray(value) ? value : [];
      return vals.length > 0
        ? <div className="db-cell-tags">{vals.map((v: string) => <span key={v} className="db-cell-tag">{v}</span>)}</div>
        : <span className="db-cell-empty">—</span>;
    }

    if (col.type === "createdBy") {
      const username = value ? String(value) : "";
      const member = members.find((m) => m.username === username);
      return username
        ? <span className="db-member-chip">{member?.fullName || username}</span>
        : <span className="db-cell-empty">—</span>;
    }

    if (col.type === "member") {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      if (isEditing) {
        return (
          <div className="db-multiselect-dropdown" onClick={(e) => e.stopPropagation()}>
            {members.map((m) => (
              <label key={m.username} className="db-multiselect-option">
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
            <button className="db-multiselect-done" onClick={() => setEditCell(null)}>Done</button>
          </div>
        );
      }
      return vals.length > 0
        ? <div className="db-cell-tags">{vals.map((u) => { const m = members.find((x) => x.username === u); return <span key={u} className="db-member-chip">{m?.fullName || u}</span>; })}</div>
        : <span className="db-cell-empty">—</span>;
    }

    if (col.type === "relation") {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      const relRows = col.relationDbId ? relatedDbRows[col.relationDbId] : undefined;
      if (isEditing) {
        if (!col.relationDbId) return <span className="db-cell-empty">No DB linked</span>;
        return (
          <div className="db-multiselect-dropdown" onClick={(e) => e.stopPropagation()}>
            {relRows == null
              ? <div className="db-relation-loading">Loading…</div>
              : relRows.map((relRow) => (
                  <label key={relRow.id} className="db-multiselect-option">
                    <input
                      type="checkbox"
                      checked={vals.includes(relRow.id)}
                      onChange={(e) => {
                        const next = e.target.checked ? [...vals, relRow.id] : vals.filter((v) => v !== relRow.id);
                        onUpdateRow(row.id, { [col.id]: next });
                      }}
                    />
                    <span>{col.relationDbId ? getRowLabel(relRow.id, col.relationDbId) : relRow.id}</span>
                  </label>
                ))
            }
            <button className="db-multiselect-done" onClick={() => setEditCell(null)}>Done</button>
          </div>
        );
      }
      if (!col.relationDbId) return <span className="db-cell-empty">—</span>;
      return vals.length > 0
        ? <div className="db-cell-tags">{vals.map((id) => {
            const label = getRowLabel(id, col.relationDbId!);
            return onNavigateToRelation
              ? <button key={id} className="db-relation-chip db-relation-chip-link" onClick={(e) => { e.stopPropagation(); onNavigateToRelation(col.relationDbId!, id, label); }}>{label}</button>
              : <span key={id} className="db-relation-chip">{label}</span>;
          })}</div>
        : <span className="db-cell-empty">—</span>;
    }

    if (isEditing) {
      return (
        <input
          autoFocus
          className="db-cell-input"
          type={col.type === "number" ? "number" : col.type === "date" ? "date" : "text"}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditCell(null); }}
        />
      );
    }

    if (col.type === "url" && value) {
      return <a href={String(value)} target="_blank" rel="noopener noreferrer" className="db-cell-link">{String(value)}</a>;
    }

    const display = value != null && value !== "" ? String(value) : "";
    return display ? <span className="db-cell-text">{display}</span> : <span className="db-cell-empty">—</span>;
  };

  return (
    <>
    <div className="db-table-wrap">
      <div className="db-table" style={{ gridTemplateColumns: gridCols }}>
        {/* Header */}
        <div className="db-th db-th-rownum">
          <input
            ref={selectAllRef}
            type="checkbox"
            className="db-select-all-check"
            checked={allSelected}
            onChange={() => setSelectedRows(allSelected || someSelected ? new Set() : new Set(rows.map((r) => r.id)))}
          />
        </div>
        {orderedCols.map((col) => (
          <div key={col.id} className="db-th" style={{ position: "relative" }}>
            <span className="db-th-name">{col.name}</span>
            {canWrite && (
              <button className="db-th-menu-btn" onClick={() => setColMenu(colMenu === col.id ? null : col.id)}>
                <MoreVertical className="w-3 h-3" />
              </button>
            )}
            {canWrite && (
              <div
                className="db-th-resize"
                onMouseDown={(e) => { e.preventDefault(); setResizing({ colId: col.id, startX: e.clientX, startW: getWidth(col) }); }}
              />
            )}
            {colMenu === col.id && (
              <div className="db-col-menu" ref={colMenuRef}>
                {colRename?.colId === col.id ? (
                  <div className="db-col-menu-rename">
                    <input
                      autoFocus
                      className="db-col-menu-input"
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
                  <div className="db-col-menu-types">
                    {COLUMN_TYPES.map((t) => (
                      <button key={t.value} className={`db-col-menu-type-btn${col.type === t.value ? " active" : ""}`}
                        onClick={() => { onUpdateColumn(col.id, { type: t.value }); setColTypeChange(null); setColMenu(null); }}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                ) : selectEditCol === col.id ? (
                  <div className="db-col-menu-rename">
                    <textarea
                      autoFocus
                      className="db-col-menu-input"
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
                ) : colDefaultPanel === col.id ? (
                  <div className="db-col-default-panel">
                    <div className="db-col-menu-item" style={{ opacity: 0.5, fontSize: "0.65rem", cursor: "default" }}>Default value</div>
                    {col.type === "date" && (
                      <label className="db-col-default-label">
                        <input type="checkbox" checked={!!col.defaultCurrentDate}
                          onChange={(e) => onUpdateColumn(col.id, { defaultCurrentDate: e.target.checked, defaultValue: undefined })} />
                        Use today's date
                      </label>
                    )}
                    {col.type === "checkbox" && (
                      <label className="db-col-default-label">
                        <input type="checkbox" checked={!!col.defaultValue}
                          onChange={(e) => onUpdateColumn(col.id, { defaultValue: e.target.checked })} />
                        Checked by default
                      </label>
                    )}
                    {(col.type === "select" || col.type === "multiSelect") && (col.options || []).map((opt) => (
                      <label key={opt} className="db-col-default-label">
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
                      <label key={m.username} className="db-col-default-label">
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
                    <button className="db-col-menu-item" style={{ marginTop: 4 }} onClick={() => setColDefaultPanel(null)}>← Back</button>
                  </div>
                ) : colRelationPanel === col.id ? (
                  <div className="db-col-default-panel">
                    <div className="db-col-menu-item" style={{ opacity: 0.5, fontSize: "0.65rem", cursor: "default" }}>Link to database</div>
                    {allDatabases.filter((d) => d.id !== db.id).length === 0
                      ? <div className="db-col-menu-item" style={{ opacity: 0.5 }}>No other databases</div>
                      : allDatabases.filter((d) => d.id !== db.id).map((d) => (
                          <button key={d.id}
                            className={`db-col-menu-item${col.relationDbId === d.id ? " active" : ""}`}
                            onClick={() => { onUpdateColumn(col.id, { relationDbId: d.id }); setColRelationPanel(null); setColMenu(null); }}
                          >
                            {d.title}
                          </button>
                        ))
                    }
                    <button className="db-col-menu-item" style={{ marginTop: 4 }} onClick={() => setColRelationPanel(null)}>← Back</button>
                  </div>
                ) : (
                  <>
                    <button className="db-col-menu-item" onClick={() => setColRename({ colId: col.id, name: col.name })}>Rename</button>
                    <button className="db-col-menu-item" onClick={() => setColTypeChange(col.id)}>Change type</button>
                    {(col.type === "select" || col.type === "multiSelect") && (
                      <button className="db-col-menu-item" onClick={() => { setSelectEditCol(col.id); setSelectOptions((col.options || []).join(", ")); }}>Edit options</button>
                    )}
                    {(col.type === "select" || col.type === "multiSelect" || col.type === "date" || col.type === "checkbox" || col.type === "member") && (
                      <button className="db-col-menu-item" onClick={() => setColDefaultPanel(col.id)}>Set default…</button>
                    )}
                    {col.type === "relation" && (
                      <button className="db-col-menu-item" onClick={() => setColRelationPanel(col.id)}>Link to database…</button>
                    )}
                    <button className="db-col-menu-item" onClick={() => {
                      const hidden = [...(view.hiddenColumns || []), col.id];
                      onUpdateView({ hiddenColumns: hidden });
                      setColMenu(null);
                    }}>Hide column</button>
                    <div className="db-col-menu-sep" />
                    <button className="db-col-menu-item danger" onClick={() => { onDeleteColumn(col.id); setColMenu(null); }}>Delete column</button>
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        {canWrite && (
          <div className="db-th db-th-add" style={{ cursor: "pointer" }} onClick={handleAddColumn}>
            <Plus className="w-3.5 h-3.5" />
          </div>
        )}

        {/* Rows */}
        {rows.map((row, rowIdx) => {
          const isSelected = selectedRows.has(row.id);
          return (
          <div key={row.id} className="db-row contents">
            <div
              className={`db-td db-td-rownum${isSelected ? " is-selected" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleRow(row.id); }}
            >
              <span className="db-rownum-num">{rowIdx + 1}</span>
              <input
                type="checkbox"
                className="db-rownum-check"
                checked={isSelected}
                onChange={() => toggleRow(row.id)}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            {orderedCols.map((col) => (
              <div
                key={col.id}
                className={`db-td${isSelected ? " is-selected" : ""}`}
                onClick={() => startEdit(row.id, col.id, row.cells[col.id])}
              >
                {renderCell(row, col)}
              </div>
            ))}
            {canWrite && (
              <div className={`db-td db-td-actions${isSelected ? " is-selected" : ""}`}>
                <button className="db-row-delete" onClick={() => onDeleteRow(row.id)} title="Delete row">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>

      {/* Add row / column buttons — outside db-table-wrap so the dropdown isn't clipped */}
      {canWrite && (
        <div className="db-table-footer">
          <button className="db-add-row" onClick={() => onAddRow()}>
            <Plus className="w-3.5 h-3.5" /> New row
          </button>
          <button className="db-add-col" onClick={handleAddColumn}>
            <Plus className="w-3.5 h-3.5" /> Add column
          </button>
        </div>
      )}
      {/* Selection action bar */}
      {selectedRows.size > 0 && (
        <div className="db-selection-bar">
          <span className="db-selection-count">{selectedRows.size} selected</span>
          <div className="db-selection-sep" />
          <button className="db-selection-btn" onClick={handleDuplicateSelected}>
            <Copy className="w-3.5 h-3.5" /> Duplicate
          </button>
          <button className="db-selection-btn" onClick={handleClearSelected}>
            <Eraser className="w-3.5 h-3.5" /> Clear values
          </button>
          <div className="db-selection-sep" />
          <button className="db-selection-btn danger" onClick={handleDeleteSelected}>
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </button>
          <button className="db-selection-dismiss" onClick={() => setSelectedRows(new Set())} title="Deselect all">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
