"use client";

import { useState, useEffect, useRef } from "react";
import { X, Copy, Trash2, Hash, Link2, Search, Plus } from "lucide-react";
import type { EnhancedTable, DbColumn, DbRow } from "@/lib/types";

const TAG_PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c",
];

function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

interface RowEditModalProps {
  db: EnhancedTable;
  row: DbRow;
  hiddenColumnIds: string[];
  canWrite: boolean;
  members: { username: string; fullName?: string }[];
  spaceSlug?: string;
  tagColors?: Record<string, string>;
  relationLabels?: Record<string, Record<string, string>>;
  onUpdateRow: (rowId: string, cells: Record<string, unknown>) => void;
  onDeleteRow: (rowId: string) => void;
  onDuplicateRow: (cells: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function RowEditModal({
  db, row, hiddenColumnIds, canWrite, members, spaceSlug, tagColors = {},
  relationLabels = {}, onUpdateRow, onDeleteRow, onDuplicateRow, onClose,
}: RowEditModalProps) {
  const [cells, setCells] = useState<Record<string, unknown>>({ ...row.cells });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Tag inline create state
  const [tagCreating, setTagCreating] = useState<string | null>(null);
  const [tagNewName, setTagNewName] = useState("");
  const [tagNewColor, setTagNewColor] = useState<string | null>(null);
  const [spaceTags, setSpaceTags] = useState<string[]>([]);

  // Relation picker state
  const [relPickerCol, setRelPickerCol] = useState<string | null>(null);
  const [relSearch, setRelSearch] = useState("");
  const [relTargetRows, setRelTargetRows] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    if (!spaceSlug) return;
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/tags`)
      .then((r) => r.json())
      .then((idx) => setSpaceTags(Object.keys(idx)))
      .catch(() => {});
  }, [spaceSlug]);

  const updateField = (colId: string, value: unknown) => {
    const next = { ...cells, [colId]: value };
    setCells(next);
    if (canWrite) onUpdateRow(row.id, { [colId]: value });
  };

  const visibleCols = db.columns.filter((c) => !hiddenColumnIds.includes(c.id));
  const hiddenCols = db.columns.filter((c) => hiddenColumnIds.includes(c.id));

  const openRelPicker = (col: DbColumn) => {
    if (!col.relation || !spaceSlug) return;
    setRelPickerCol(col.id);
    setRelSearch("");
    const { targetSpace, targetDbId, displayColumnId } = col.relation;
    fetch(`/api/spaces/${encodeURIComponent(targetSpace)}/enhanced-tables/${encodeURIComponent(targetDbId)}`)
      .then((r) => r.json())
      .then((targetDb: EnhancedTable) => {
        const dispCol = displayColumnId
          ? targetDb.columns.find((c) => c.id === displayColumnId)
          : targetDb.columns.find((c) => c.type === "text") || targetDb.columns[0];
        setRelTargetRows(
          targetDb.rows.map((r) => ({
            id: r.id,
            label: dispCol ? (r.cells[dispCol.id] != null ? String(r.cells[dispCol.id]) : "") : r.id,
          }))
        );
      })
      .catch(() => setRelTargetRows([]));
  };

  const renderField = (col: DbColumn) => {
    const value = cells[col.id];
    const readOnly = !canWrite || col.type === "createdBy" || col.type === "formula" || col.type === "lookup";

    // Text / URL / Email
    if (col.type === "text" || col.type === "url" || col.type === "email") {
      return (
        <input
          className="rem-input"
          type={col.type === "url" ? "url" : col.type === "email" ? "email" : "text"}
          value={value != null ? String(value) : ""}
          disabled={readOnly}
          onChange={(e) => updateField(col.id, e.target.value)}
        />
      );
    }

    // Number
    if (col.type === "number") {
      return (
        <input
          className="rem-input"
          type="number"
          value={value != null ? String(value) : ""}
          disabled={readOnly}
          onChange={(e) => updateField(col.id, e.target.value === "" ? null : Number(e.target.value))}
        />
      );
    }

    // Date
    if (col.type === "date") {
      return (
        <input
          className="rem-input"
          type="date"
          value={value != null ? String(value) : ""}
          disabled={readOnly}
          onChange={(e) => updateField(col.id, e.target.value)}
        />
      );
    }

    // Checkbox
    if (col.type === "checkbox") {
      return (
        <label className="rem-check-label">
          <input
            type="checkbox"
            checked={!!value}
            disabled={readOnly}
            onChange={(e) => updateField(col.id, e.target.checked)}
          />
          {value ? "Yes" : "No"}
        </label>
      );
    }

    // Select
    if (col.type === "select") {
      return (
        <select
          className="rem-input"
          value={String(value || "")}
          disabled={readOnly}
          onChange={(e) => updateField(col.id, e.target.value)}
        >
          <option value="">—</option>
          {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }

    // Multi Select
    if (col.type === "multiSelect") {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="rem-multi">
          {(col.options || []).map((o) => (
            <label key={o} className="rem-multi-opt">
              <input
                type="checkbox"
                checked={vals.includes(o)}
                disabled={readOnly}
                onChange={(e) => {
                  const next = e.target.checked ? [...vals, o] : vals.filter((v) => v !== o);
                  updateField(col.id, next);
                }}
              />
              {o}
            </label>
          ))}
        </div>
      );
    }

    // Member
    if (col.type === "member") {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="rem-multi">
          {members.map((m) => (
            <label key={m.username} className="rem-multi-opt">
              <input
                type="checkbox"
                checked={vals.includes(m.username)}
                disabled={readOnly}
                onChange={(e) => {
                  const next = e.target.checked ? [...vals, m.username] : vals.filter((v) => v !== m.username);
                  updateField(col.id, next);
                }}
              />
              {m.fullName || m.username}
            </label>
          ))}
        </div>
      );
    }

    // Created By (read-only)
    if (col.type === "createdBy") {
      const username = value ? String(value) : "";
      const member = members.find((m) => m.username === username);
      return <div className="rem-readonly">{member?.fullName || username || "—"}</div>;
    }

    // Formula / Lookup (read-only)
    if (col.type === "formula" || col.type === "lookup") {
      const display = value == null ? "—" : Array.isArray(value) ? value.join(", ") : String(value);
      return <div className="rem-readonly">{display}</div>;
    }

    // Tag
    if (col.type === "tag") {
      const vals = Array.isArray(value) ? (value as string[]) : [];
      const available = spaceTags.filter((t) => !vals.includes(t));
      return (
        <div className="rem-tag-field">
          <div className="rem-tag-chips">
            {vals.map((t) => {
              const tc = tagColors[t];
              return (
                <span key={t} className="et-tag-chip" style={tc ? { background: tc, color: contrastText(tc) } : undefined}>
                  #{t}
                  {canWrite && (
                    <button className="et-tag-chip-remove" style={tc ? { color: contrastText(tc) } : undefined}
                      onClick={() => updateField(col.id, vals.filter((v) => v !== t))}>×</button>
                  )}
                </span>
              );
            })}
          </div>
          {canWrite && (
            <select className="rem-input rem-input-sm" value="" onChange={(e) => {
              if (e.target.value && !vals.includes(e.target.value)) {
                updateField(col.id, [...vals, e.target.value]);
              }
            }}>
              <option value="">Add tag…</option>
              {available.slice(0, 20).map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
        </div>
      );
    }

    // Relation
    if (col.type === "relation" && col.relation) {
      const linkedIds = Array.isArray(value) ? (value as string[]) : value ? [String(value)] : [];
      const labels = relationLabels[col.id] || {};
      const isOne = col.relation.limit === "one";
      const isPickerOpen = relPickerCol === col.id;

      return (
        <div className="rem-relation-field">
          <div className="rem-tag-chips">
            {linkedIds.map((id) => (
              <span key={id} className="et-cell-tag et-relation-chip">
                <Link2 className="w-3 h-3 inline mr-0.5" />
                {labels[id] || id}
                {canWrite && (
                  <button className="et-tag-chip-remove" onClick={() => {
                    const next = isOne ? null : linkedIds.filter((v) => v !== id);
                    updateField(col.id, next);
                  }}>×</button>
                )}
              </span>
            ))}
          </div>
          {canWrite && !isPickerOpen && (
            <button className="rem-add-btn" onClick={() => openRelPicker(col)}>
              <Plus className="w-3 h-3" /> Link record
            </button>
          )}
          {isPickerOpen && (
            <div className="rem-relation-picker">
              <div className="et-relation-search-wrap">
                <Search className="w-3 h-3 text-text-muted" />
                <input autoFocus className="et-relation-search" placeholder="Search…" value={relSearch}
                  onChange={(e) => setRelSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setRelPickerCol(null); }}
                />
              </div>
              <div className="et-relation-list" style={{ maxHeight: 160 }}>
                {relTargetRows
                  .filter((r) => !relSearch || r.label.toLowerCase().includes(relSearch.toLowerCase()))
                  .slice(0, 20)
                  .map((tr) => {
                    const checked = linkedIds.includes(tr.id);
                    return (
                      <label key={tr.id} className="et-multiselect-option">
                        <input
                          type={isOne ? "radio" : "checkbox"}
                          checked={checked}
                          onChange={() => {
                            let next: string | string[] | null;
                            if (isOne) next = checked ? null : tr.id;
                            else next = checked ? linkedIds.filter((id) => id !== tr.id) : [...linkedIds, tr.id];
                            updateField(col.id, next);
                            if (isOne) setRelPickerCol(null);
                          }}
                        />
                        <span>{tr.label || tr.id}</span>
                      </label>
                    );
                  })}
              </div>
              <button className="et-multiselect-done" onClick={() => setRelPickerCol(null)}>Done</button>
            </div>
          )}
        </div>
      );
    }

    // Fallback
    return (
      <input
        className="rem-input"
        type="text"
        value={value != null ? String(value) : ""}
        disabled={readOnly}
        onChange={(e) => updateField(col.id, e.target.value)}
      />
    );
  };

  const renderSection = (cols: DbColumn[], label?: string) => (
    <>
      {label && <div className="rem-section-label">{label}</div>}
      {cols.map((col) => (
        <div key={col.id} className="rem-field">
          <label className="rem-field-label">{col.name}</label>
          {renderField(col)}
        </div>
      ))}
    </>
  );

  return (
    <div className="rem-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rem-panel">
        {/* Header */}
        <div className="rem-header">
          <div className="rem-header-info">
            <span className="rem-header-title">{db.title}</span>
            <span className="rem-header-meta">Created {new Date(row.createdAt).toLocaleString()}</span>
          </div>
          <button className="rem-close" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>

        {/* Form */}
        <div className="rem-body">
          {renderSection(visibleCols)}
          {hiddenCols.length > 0 && renderSection(hiddenCols, `${hiddenCols.length} hidden field${hiddenCols.length > 1 ? "s" : ""}`)}
        </div>

        {/* Footer */}
        {canWrite && (
          <div className="rem-footer">
            <button className="rem-btn rem-btn-secondary" onClick={() => { onDuplicateRow({ ...cells }); }}>
              <Copy className="w-3.5 h-3.5" /> Duplicate
            </button>
            <div className="rem-footer-spacer" />
            {confirmDelete ? (
              <div className="rem-delete-confirm">
                <span className="text-xs text-red-500 font-medium">Delete this row?</span>
                <button className="rem-btn rem-btn-danger" onClick={() => { onDeleteRow(row.id); onClose(); }}>Yes, delete</button>
                <button className="rem-btn rem-btn-secondary" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            ) : (
              <button className="rem-btn rem-btn-danger-outline" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
