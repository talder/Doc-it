"use client";

import { Plus, X } from "lucide-react";
import type { DbColumn, DbFilter, DbFilterOp } from "@/lib/types";

const OPS_BY_TYPE: Record<string, { value: DbFilterOp; label: string }[]> = {
  text:        [{ value: "contains", label: "contains" }, { value: "eq", label: "equals" }, { value: "notContains", label: "not contains" }, { value: "isEmpty", label: "is empty" }, { value: "isNotEmpty", label: "is not empty" }],
  url:         [{ value: "contains", label: "contains" }, { value: "eq", label: "equals" }, { value: "isEmpty", label: "is empty" }, { value: "isNotEmpty", label: "is not empty" }],
  email:       [{ value: "contains", label: "contains" }, { value: "eq", label: "equals" }, { value: "isEmpty", label: "is empty" }, { value: "isNotEmpty", label: "is not empty" }],
  number:      [{ value: "eq", label: "=" }, { value: "neq", label: "≠" }, { value: "gt", label: ">" }, { value: "gte", label: "≥" }, { value: "lt", label: "<" }, { value: "lte", label: "≤" }, { value: "isEmpty", label: "is empty" }],
  select:      [{ value: "is", label: "is" }, { value: "isNot", label: "is not" }, { value: "isEmpty", label: "is empty" }, { value: "isNotEmpty", label: "is not empty" }],
  multiSelect: [{ value: "contains", label: "contains" }, { value: "notContains", label: "not contains" }, { value: "isEmpty", label: "is empty" }],
  checkbox:    [{ value: "isTrue", label: "is checked" }, { value: "isFalse", label: "is unchecked" }],
  date:        [{ value: "is", label: "is" }, { value: "before", label: "before" }, { value: "after", label: "after" }, { value: "isEmpty", label: "is empty" }],
};

const NO_VALUE_OPS: DbFilterOp[] = ["isEmpty", "isNotEmpty", "isTrue", "isFalse"];

interface Props {
  columns: DbColumn[];
  filters: DbFilter[];
  filterLogic: "and" | "or";
  onChange: (filters: DbFilter[], logic: "and" | "or") => void;
  onClose: () => void;
}

export default function DatabaseFilter({ columns, filters, filterLogic, onChange, onClose }: Props) {
  const addFilter = () => {
    const col = columns[0];
    if (!col) return;
    const ops = OPS_BY_TYPE[col.type] || OPS_BY_TYPE.text;
    onChange([...filters, { columnId: col.id, op: ops[0].value, value: "" }], filterLogic);
  };

  const updateFilter = (idx: number, partial: Partial<DbFilter>) => {
    const next = filters.map((f, i) => (i === idx ? { ...f, ...partial } : f));
    onChange(next, filterLogic);
  };

  const removeFilter = (idx: number) => {
    onChange(filters.filter((_, i) => i !== idx), filterLogic);
  };

  return (
    <div className="et-filter-panel">
      <div className="et-filter-header">
        <span className="text-xs font-semibold text-text-muted uppercase">Filters</span>
        <button onClick={onClose} className="et-filter-close"><X className="w-3.5 h-3.5" /></button>
      </div>
      {filters.length > 1 && (
        <div className="et-filter-logic">
          <button className={`et-filter-logic-btn${filterLogic === "and" ? " active" : ""}`} onClick={() => onChange(filters, "and")}>AND</button>
          <button className={`et-filter-logic-btn${filterLogic === "or" ? " active" : ""}`} onClick={() => onChange(filters, "or")}>OR</button>
        </div>
      )}
      <div className="et-filter-rows">
        {filters.map((f, idx) => {
          const col = columns.find((c) => c.id === f.columnId);
          const ops = OPS_BY_TYPE[col?.type || "text"] || OPS_BY_TYPE.text;
          const needsValue = !NO_VALUE_OPS.includes(f.op);
          return (
            <div key={idx} className="et-filter-row">
              <select
                className="et-filter-select"
                value={f.columnId}
                onChange={(e) => {
                  const newCol = columns.find((c) => c.id === e.target.value);
                  const newOps = OPS_BY_TYPE[newCol?.type || "text"] || OPS_BY_TYPE.text;
                  updateFilter(idx, { columnId: e.target.value, op: newOps[0].value, value: "" });
                }}
              >
                {columns.filter((c) => c.type !== "formula").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select className="et-filter-select" value={f.op} onChange={(e) => updateFilter(idx, { op: e.target.value as DbFilterOp })}>
                {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {needsValue && col?.type === "select" ? (
                <select className="et-filter-select" value={String(f.value || "")} onChange={(e) => updateFilter(idx, { value: e.target.value })}>
                  <option value="">—</option>
                  {(col.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : needsValue && col?.type === "date" ? (
                <div className="et-filter-date-wrap">
                  <input
                    className="et-filter-input"
                    type="date"
                    value={String(f.value ?? "")}
                    onChange={(e) => updateFilter(idx, { value: e.target.value })}
                  />
                  <div className="et-filter-date-presets">
                    {[
                      { label: "Today", fn: () => new Date().toISOString().slice(0, 10) },
                      { label: "7d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); } },
                      { label: "30d", fn: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); } },
                      { label: "This month", fn: () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; } },
                    ].map((p) => (
                      <button key={p.label} className="et-filter-date-preset" onClick={() => updateFilter(idx, { value: p.fn() })} title={p.label}>{p.label}</button>
                    ))}
                  </div>
                </div>
              ) : needsValue ? (
                <input
                  className="et-filter-input"
                  type={col?.type === "number" ? "number" : "text"}
                  placeholder="value"
                  value={String(f.value ?? "")}
                  onChange={(e) => updateFilter(idx, { value: col?.type === "number" ? Number(e.target.value) : e.target.value })}
                />
              ) : null}
              <button className="et-filter-remove" onClick={() => removeFilter(idx)}><X className="w-3 h-3" /></button>
            </div>
          );
        })}
      </div>
      <button className="et-filter-add" onClick={addFilter}><Plus className="w-3.5 h-3.5" /> Add filter</button>
    </div>
  );
}
