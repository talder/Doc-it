"use client";

import { Plus, X } from "lucide-react";
import type { DbColumn, DbSort } from "@/lib/types";

interface Props {
  columns: DbColumn[];
  sorts: DbSort[];
  onChange: (sorts: DbSort[]) => void;
  onClose: () => void;
}

export default function DatabaseSort({ columns, sorts, onChange, onClose }: Props) {
  const addSort = () => {
    const col = columns.find((c) => c.type !== "formula") || columns[0];
    if (!col) return;
    onChange([...sorts, { columnId: col.id, dir: "asc" }]);
  };

  const updateSort = (idx: number, partial: Partial<DbSort>) => {
    onChange(sorts.map((s, i) => (i === idx ? { ...s, ...partial } : s)));
  };

  const removeSort = (idx: number) => {
    onChange(sorts.filter((_, i) => i !== idx));
  };

  return (
    <div className="et-filter-panel">
      <div className="et-filter-header">
        <span className="text-xs font-semibold text-text-muted uppercase">Sort</span>
        <button onClick={onClose} className="et-filter-close"><X className="w-3.5 h-3.5" /></button>
      </div>
      <div className="et-filter-rows">
        {sorts.map((s, idx) => (
          <div key={idx} className="et-filter-row">
            <select className="et-filter-select" value={s.columnId} onChange={(e) => updateSort(idx, { columnId: e.target.value })}>
              {columns.filter((c) => c.type !== "formula").map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select className="et-filter-select" value={s.dir} onChange={(e) => updateSort(idx, { dir: e.target.value as "asc" | "desc" })}>
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
            <button className="et-filter-remove" onClick={() => removeSort(idx)}><X className="w-3 h-3" /></button>
          </div>
        ))}
      </div>
      <button className="et-filter-add" onClick={addSort}><Plus className="w-3.5 h-3.5" /> Add sort</button>
    </div>
  );
}
