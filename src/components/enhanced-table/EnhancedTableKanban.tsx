"use client";

import { useState, useRef } from "react";
import { Plus } from "lucide-react";
import type { EnhancedTable, DbColumn, DbRow, DbView } from "@/lib/types";

interface Props {
  db: EnhancedTable;
  view: DbView;
  rows: DbRow[];
  canWrite: boolean;
  onAddRow: (cells?: Record<string, unknown>) => void;
  onUpdateRow: (rowId: string, cells: Record<string, unknown>) => void;
}

export default function DatabaseKanban({ db, view, rows, canWrite, onAddRow, onUpdateRow }: Props) {
  const groupCol = db.columns.find((c) => c.id === view.groupBy);
  const titleCol = db.columns.find((c) => c.type === "text") || db.columns[0];
  const [dragRowId, setDragRowId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<string | null>(null);

  if (!groupCol || (groupCol.type !== "select" && groupCol.type !== "multiSelect")) {
    return (
      <div className="et-kanban-empty">
        <p className="text-sm text-text-muted">Kanban view requires a Select column to group by.</p>
        <p className="text-xs text-text-muted">Set the &quot;Group By&quot; column in view settings.</p>
      </div>
    );
  }

  const lanes = [...(groupCol.options || []), ""];
  const laneLabels = lanes.map((l) => l || "No value");

  const getLaneRows = (lane: string) => {
    return rows.filter((r) => {
      const v = String(r.cells[groupCol.id] || "");
      return lane === "" ? !v : v === lane;
    });
  };

  const onDragStart = (rowId: string) => setDragRowId(rowId);
  const onDragEnd = () => { setDragRowId(null); setDragOverLane(null); };
  const onDrop = (lane: string) => {
    if (!dragRowId || !canWrite) return;
    onUpdateRow(dragRowId, { [groupCol.id]: lane || "" });
    setDragRowId(null);
    setDragOverLane(null);
  };

  return (
    <div className="et-kanban">
      {lanes.map((lane, i) => (
        <div
          key={lane || "__none"}
          className={`et-kanban-lane${dragOverLane === lane ? " drag-over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverLane(lane); }}
          onDragLeave={() => setDragOverLane(null)}
          onDrop={(e) => { e.preventDefault(); onDrop(lane); }}
        >
          <div className="et-kanban-lane-header">
            <span className="et-kanban-lane-title">{laneLabels[i]}</span>
            <span className="et-kanban-lane-count">{getLaneRows(lane).length}</span>
          </div>
          <div className="et-kanban-cards">
            {getLaneRows(lane).map((row) => (
              <div
                key={row.id}
                className={`et-kanban-card${dragRowId === row.id ? " dragging" : ""}`}
                draggable={canWrite}
                onDragStart={() => onDragStart(row.id)}
                onDragEnd={onDragEnd}
              >
                <div className="et-kanban-card-title">{String(row.cells[titleCol?.id || ""] || "Untitled")}</div>
                <div className="et-kanban-card-fields">
                  {db.columns.filter((c) => c.id !== groupCol.id && c.id !== titleCol?.id).slice(0, 3).map((c) => {
                    const v = row.cells[c.id];
                    if (v == null || v === "") return null;
                    return (
                      <div key={c.id} className="et-kanban-card-field">
                        <span className="et-kanban-field-label">{c.name}</span>
                        <span className="et-kanban-field-value">{c.type === "checkbox" ? (v ? "✓" : "✗") : String(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {canWrite && (
            <button className="et-kanban-add" onClick={() => onAddRow({ [groupCol.id]: lane })}>
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
