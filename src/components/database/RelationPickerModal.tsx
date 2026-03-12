"use client";

import { useState, useRef, useEffect } from "react";
import { X, Search, Check } from "lucide-react";
import type { DbRow, DbColumn } from "@/lib/types";

interface Props {
  rows: DbRow[];
  columns: DbColumn[];
  selectedIds: string[];
  displayColumnId?: string;
  dbTitle: string;
  onToggle: (rowId: string, selected: boolean) => void;
  onClose: () => void;
}

export default function RelationPickerModal({
  rows, columns, selectedIds, displayColumnId, dbTitle, onToggle, onClose,
}: Props) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Determine which column is used for the main label
  const labelColId: string | null = (() => {
    if (displayColumnId) return displayColumnId;
    // Auto: find the first text-like column
    for (const col of columns) {
      if (col.type === "createdBy" || col.type === "checkbox") continue;
      return col.id;
    }
    return null;
  })();

  const getLabel = (row: DbRow): string => {
    if (labelColId && row.cells[labelColId] != null && row.cells[labelColId] !== "") {
      return String(row.cells[labelColId]);
    }
    return `Row ${row.id.slice(0, 6)}`;
  };

  const getSubLabel = (row: DbRow): string | null => {
    // Show a secondary column value for context — skip the label column
    for (const col of columns) {
      if (col.id === labelColId) continue;
      if (col.type === "createdBy" || col.type === "checkbox" || col.type === "relation") continue;
      const v = row.cells[col.id];
      if (v != null && v !== "" && typeof v === "string") return `${col.name}: ${v}`;
    }
    return null;
  };

  const lowerSearch = search.toLowerCase();
  const filtered = rows.filter((row) => {
    if (!search) return true;
    const label = getLabel(row).toLowerCase();
    if (label.includes(lowerSearch)) return true;
    // Also search across all text cells
    return Object.values(row.cells).some(
      (v) => v != null && typeof v === "string" && v.toLowerCase().includes(lowerSearch)
    );
  });

  // Pin selected items to the top
  const selected = filtered.filter((r) => selectedIds.includes(r.id));
  const unselected = filtered.filter((r) => !selectedIds.includes(r.id));
  const ordered = [...selected, ...unselected];

  return (
    <div
      className="relation-picker-overlay"
      ref={overlayRef}
      onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relation-picker-modal">
        <div className="relation-picker-header">
          <span className="relation-picker-title">Link to {dbTitle}</span>
          <button className="relation-picker-close" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relation-picker-search">
          <Search className="w-3.5 h-3.5 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search records…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="relation-picker-search-input"
          />
          {search && (
            <button className="relation-picker-search-clear" onClick={() => setSearch("")}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="relation-picker-list">
          {ordered.length === 0 && (
            <div className="relation-picker-empty">
              {search ? "No matching records" : "No records in this database"}
            </div>
          )}
          {ordered.map((row) => {
            const isSelected = selectedIds.includes(row.id);
            const label = getLabel(row);
            const sub = getSubLabel(row);
            return (
              <button
                key={row.id}
                className={`relation-picker-item${isSelected ? " is-selected" : ""}`}
                onClick={() => onToggle(row.id, !isSelected)}
              >
                <span className={`relation-picker-check${isSelected ? " checked" : ""}`}>
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
                <span className="relation-picker-item-content">
                  <span className="relation-picker-item-label">{label}</span>
                  {sub && <span className="relation-picker-item-sub">{sub}</span>}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relation-picker-footer">
          <span className="relation-picker-count">
            {selectedIds.length} selected
          </span>
          <button className="relation-picker-done" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
