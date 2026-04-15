"use client";

import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
import type { DbColumn, DbFilter, DbFilterOp, EnhancedTable } from "@/lib/types";

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
  spaceSlug?: string;
}

export default function DatabaseFilter({ columns, filters, filterLogic, onChange, onClose, spaceSlug }: Props) {
  // Cache of target table columns for cross-table filters: "space/dbId" -> DbColumn[]
  const [targetColsCache, setTargetColsCache] = useState<Record<string, { title: string; columns: DbColumn[] }>>({});

  // Fetch target table columns when a relation column is used in a filter
  useEffect(() => {
    if (!spaceSlug) return;
    for (const f of filters) {
      if (!f.throughRelation) continue;
      const relCol = columns.find((c) => c.id === f.throughRelation!.relationColumnId);
      if (!relCol?.relation) continue;
      const key = `${relCol.relation.targetSpace}/${relCol.relation.targetDbId}`;
      if (targetColsCache[key]) continue;
      fetch(`/api/spaces/${encodeURIComponent(relCol.relation.targetSpace)}/enhanced-tables/${encodeURIComponent(relCol.relation.targetDbId)}`)
        .then((r) => r.json())
        .then((data: EnhancedTable) => {
          setTargetColsCache((prev) => ({ ...prev, [key]: { title: data.title, columns: data.columns } }));
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, columns, spaceSlug]);
  const addFilter = () => {
    const col = columns[0];
    if (!col) return;
    const ops = OPS_BY_TYPE[col.type] || OPS_BY_TYPE.text;
    onChange([...filters, { columnId: col.id, op: ops[0].value, value: "" }], filterLogic);
  };

  // Helper to get target table info for a relation column
  const getTargetInfo = (relCol: DbColumn) => {
    if (!relCol.relation) return null;
    const key = `${relCol.relation.targetSpace}/${relCol.relation.targetDbId}`;
    return targetColsCache[key] || null;
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
          const isRelation = col?.type === "relation" && col.relation;
          const isCrossTable = !!f.throughRelation;

          // For cross-table filters, resolve the effective column type from the target table
          let effectiveType = col?.type || "text";
          let effectiveCol = col;
          if (isCrossTable && isRelation) {
            const target = getTargetInfo(col!);
            if (target) {
              const tc = target.columns.find((c) => c.id === f.throughRelation!.targetColumnId);
              if (tc) { effectiveType = tc.type; effectiveCol = tc; }
            }
          }

          const ops = OPS_BY_TYPE[effectiveType] || OPS_BY_TYPE.text;
          const needsValue = !NO_VALUE_OPS.includes(f.op);
          return (
            <div key={idx} className="et-filter-row">
              <select
                className="et-filter-select"
                value={isCrossTable ? f.throughRelation!.relationColumnId : f.columnId}
                onChange={(e) => {
                  const newCol = columns.find((c) => c.id === e.target.value);
                  if (newCol?.type === "relation" && newCol.relation) {
                    // Switching to a relation column — set up cross-table filter
                    const target = getTargetInfo(newCol);
                    const firstTargetCol = target?.columns.find((c) => c.type !== "relation" && c.type !== "lookup") || target?.columns[0];
                    const targetOps = OPS_BY_TYPE[firstTargetCol?.type || "text"] || OPS_BY_TYPE.text;
                    updateFilter(idx, {
                      columnId: newCol.id,
                      op: targetOps[0].value,
                      value: "",
                      throughRelation: {
                        relationColumnId: newCol.id,
                        targetColumnId: firstTargetCol?.id || "",
                      },
                    });
                    // Trigger target table fetch if not cached
                    if (!target && spaceSlug) {
                      fetch(`/api/spaces/${encodeURIComponent(newCol.relation.targetSpace)}/enhanced-tables/${encodeURIComponent(newCol.relation.targetDbId)}`)
                        .then((r) => r.json())
                        .then((data: EnhancedTable) => {
                          const key = `${newCol.relation!.targetSpace}/${newCol.relation!.targetDbId}`;
                          setTargetColsCache((prev) => ({ ...prev, [key]: { title: data.title, columns: data.columns } }));
                        })
                        .catch(() => {});
                    }
                  } else {
                    const newOps = OPS_BY_TYPE[newCol?.type || "text"] || OPS_BY_TYPE.text;
                    updateFilter(idx, { columnId: e.target.value, op: newOps[0].value, value: "", throughRelation: undefined });
                  }
                }}
              >
                {columns.filter((c) => c.type !== "formula").map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.type === "relation" ? " →" : ""}</option>
                ))}
              </select>
              {/* Cross-table: show target field picker */}
              {isCrossTable && isRelation && (() => {
                const target = getTargetInfo(col!);
                return (
                  <select
                    className="et-filter-select"
                    value={f.throughRelation!.targetColumnId}
                    onChange={(e) => {
                      const tc = target?.columns.find((c) => c.id === e.target.value);
                      const newOps = OPS_BY_TYPE[tc?.type || "text"] || OPS_BY_TYPE.text;
                      updateFilter(idx, {
                        op: newOps[0].value,
                        value: "",
                        throughRelation: { ...f.throughRelation!, targetColumnId: e.target.value },
                      });
                    }}
                  >
                    {!target && <option value="">Loading…</option>}
                    {target?.columns.filter((c) => c.type !== "relation" && c.type !== "lookup").map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                );
              })()}
              <select className="et-filter-select" value={f.op} onChange={(e) => updateFilter(idx, { op: e.target.value as DbFilterOp })}>
                {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {needsValue && effectiveCol?.type === "select" ? (
                <select className="et-filter-select" value={String(f.value || "")} onChange={(e) => updateFilter(idx, { value: e.target.value })}>
                  <option value="">—</option>
                  {(effectiveCol.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : needsValue && effectiveType === "date" ? (
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
                  type={effectiveType === "number" ? "number" : "text"}
                  placeholder="value"
                  value={String(f.value ?? "")}
                  onChange={(e) => updateFilter(idx, { value: effectiveType === "number" ? Number(e.target.value) : e.target.value })}
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
