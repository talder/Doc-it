"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { Database as DbIcon, Settings, Loader2, X, Plus, Trash2 } from "lucide-react";
import type { EnhancedTable, DbColumn, DbRow, DbFilter, DbFilterOp, DbSort } from "@/lib/types";

interface QueryConfig {
  spaceSlug: string;
  dbId: string;
  columns: string[];
  filters: DbFilter[];
  sorts: DbSort[];
  limit: number;
  join?: {
    relationColumnId: string;
    targetColumns: string[];  // column IDs on target table
  };
}

function decodeConfig(b64: string): QueryConfig {
  const empty: QueryConfig = { spaceSlug: "", dbId: "", columns: [], filters: [], sorts: [], limit: 0 };
  if (!b64) return empty;
  try {
    const raw = JSON.parse(atob(b64));
    return {
      spaceSlug: raw.spaceSlug || "",
      dbId: raw.dbId || "",
      columns: typeof raw.columns === "string" ? JSON.parse(raw.columns) : (raw.columns || []),
      filters: typeof raw.filters === "string" ? JSON.parse(raw.filters) : (raw.filters || []),
      sorts: typeof raw.sorts === "string" ? JSON.parse(raw.sorts) : (raw.sorts || []),
      limit: raw.limit || 0,
      join: raw.join || undefined,
    };
  } catch { return empty; }
}

function encodeConfig(cfg: QueryConfig): string {
  const obj: Record<string, unknown> = {
    spaceSlug: cfg.spaceSlug,
    dbId: cfg.dbId,
    columns: cfg.columns,
    filters: cfg.filters,
    sorts: cfg.sorts,
    limit: cfg.limit,
  };
  if (cfg.join) obj.join = cfg.join;
  return btoa(JSON.stringify(obj));
}

interface NodeViewProps {
  node: { attrs: { config: string } };
  updateAttributes: (attrs: Record<string, unknown>) => void;
  editor: { isEditable: boolean };
}

const FILTER_OPS: { value: DbFilterOp; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "contains", label: "contains" },
  { value: "notContains", label: "not contains" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "isEmpty", label: "is empty" },
  { value: "isNotEmpty", label: "is not empty" },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function applyFilters(rows: DbRow[], filters: DbFilter[], columns: DbColumn[]): DbRow[] {
  if (filters.length === 0) return rows;
  return rows.filter((row) => filters.every((f) => matchesFilter(row, f, columns)));
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

// ── Component ──────────────────────────────────────────────────────────────────

export function QueryBlockNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const cfg = useMemo(() => decodeConfig(node.attrs.config), [node.attrs.config]);
  const { spaceSlug, dbId, columns: selectedColumns, filters: queryFilters, sorts: querySorts, limit, join: queryJoin } = cfg;
  const editable = editor?.isEditable ?? false;

  const [db, setDb] = useState<EnhancedTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [configOpen, setConfigOpen] = useState(!dbId && editable);
  // Relation label cache: colId -> { rowId -> label }
  const [relationLabels, setRelationLabels] = useState<Record<string, Record<string, string>>>({});
  // Join results
  const [joinedRows, setJoinedRows] = useState<{ id: string; cells: Record<string, unknown>; _joined: Record<string, unknown> }[] | null>(null);
  const [joinedColumns, setJoinedColumns] = useState<{ id: string; name: string; type: string }[]>([]);
  const [joinTargetTitle, setJoinTargetTitle] = useState("");

  // Config panel state
  const [tables, setTables] = useState<{ id: string; title: string }[]>([]);
  const [cfgDbId, setCfgDbId] = useState(dbId);
  const [cfgCols, setCfgCols] = useState<string[]>(selectedColumns);
  const [cfgFilters, setCfgFilters] = useState<DbFilter[]>(queryFilters);
  const [cfgSorts, setCfgSorts] = useState<DbSort[]>(querySorts);
  const [cfgLimit, setCfgLimit] = useState(limit);
  const [cfgTargetDb, setCfgTargetDb] = useState<EnhancedTable | null>(null);

  // Join config state
  const [cfgJoinRelCol, setCfgJoinRelCol] = useState(queryJoin?.relationColumnId || "");
  const [cfgJoinTargetCols, setCfgJoinTargetCols] = useState<string[]>(queryJoin?.targetColumns || []);
  const [cfgJoinTargetDb, setCfgJoinTargetDb] = useState<EnhancedTable | null>(null);

  // Fetch table list for picker
  useEffect(() => {
    if (!spaceSlug || !configOpen) return;
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables`)
      .then((r) => r.json())
      .then((list: EnhancedTable[]) => setTables(list.map((t) => ({ id: t.id, title: t.title }))))
      .catch(() => {});
  }, [spaceSlug, configOpen]);

  // Fetch the selected target table for config panel
  useEffect(() => {
    if (!cfgDbId || !spaceSlug) { setCfgTargetDb(null); return; }
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables/${encodeURIComponent(cfgDbId)}`)
      .then((r) => r.json())
      .then((data: EnhancedTable) => setCfgTargetDb(data))
      .catch(() => setCfgTargetDb(null));
  }, [cfgDbId, spaceSlug]);

  // Fetch join target table for config panel
  useEffect(() => {
    if (!cfgJoinRelCol || !cfgTargetDb) { setCfgJoinTargetDb(null); return; }
    const relCol = cfgTargetDb.columns.find((c) => c.id === cfgJoinRelCol);
    if (!relCol?.relation) { setCfgJoinTargetDb(null); return; }
    fetch(`/api/spaces/${encodeURIComponent(relCol.relation.targetSpace)}/enhanced-tables/${encodeURIComponent(relCol.relation.targetDbId)}`)
      .then((r) => r.json())
      .then((data: EnhancedTable) => setCfgJoinTargetDb(data))
      .catch(() => setCfgJoinTargetDb(null));
  }, [cfgJoinRelCol, cfgTargetDb]);

  // Fetch the configured table for results
  const fetchDb = useCallback(async () => {
    if (!dbId || !spaceSlug) { setLoading(false); return; }
    try {
      const res = await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables/${encodeURIComponent(dbId)}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setDb(data);
      // If join is configured, fetch joined results via the join API
      if (queryJoin?.relationColumnId && queryJoin.targetColumns.length > 0) {
        const relCol = data.columns.find((c: DbColumn) => c.id === queryJoin.relationColumnId);
        if (relCol?.relation) {
          const joinRes = await fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables/${encodeURIComponent(dbId)}/join`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetDbId: relCol.relation.targetDbId,
              relationColumnId: queryJoin.relationColumnId,
              targetColumns: queryJoin.targetColumns,
              filters: queryFilters,
              sorts: querySorts,
              limit: limit > 0 ? limit : undefined,
            }),
          });
          if (joinRes.ok) {
            const joinData = await joinRes.json();
            setJoinedRows(joinData.rows);
            setJoinedColumns(joinData.joinedColumns);
            setJoinTargetTitle(joinData.targetTable);
          }
        }
      }
    } catch { setError("Table not found"); }
    finally { setLoading(false); }
  }, [dbId, spaceSlug, queryJoin, queryFilters, querySorts, limit]);

  useEffect(() => { fetchDb(); }, [fetchDb]);

  // Fetch relation labels for relation columns
  useEffect(() => {
    if (!db || !spaceSlug) return;
    const relCols = db.columns.filter((c) => c.type === "relation" && c.relation);
    for (const col of relCols) {
      const ids = new Set<string>();
      for (const row of db.rows) {
        const val = row.cells[col.id];
        if (Array.isArray(val)) val.forEach((v: string) => ids.add(v));
        else if (val) ids.add(String(val));
      }
      if (ids.size === 0) continue;
      fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables/${encodeURIComponent(db.id)}/rows/lookup?columnId=${encodeURIComponent(col.id)}&rowIds=${encodeURIComponent([...ids].join(","))}`)
        .then((r) => r.json())
        .then((data) => { if (data.labels) setRelationLabels((prev) => ({ ...prev, [col.id]: data.labels })); })
        .catch(() => {});
    }
  }, [db, spaceSlug]);

  // Compute results
  const results = (() => {
    if (!db) return [];
    let rows = [...db.rows];
    rows = applyFilters(rows, queryFilters, db.columns);
    rows = applySorts(rows, querySorts, db.columns);
    if (limit > 0) rows = rows.slice(0, limit);
    return rows;
  })();

  // Visible columns
  const visibleCols = (() => {
    if (!db) return [];
    if (selectedColumns.length === 0) return db.columns;
    return selectedColumns.map((id) => db.columns.find((c) => c.id === id)).filter(Boolean) as DbColumn[];
  })();

  // Save config
  const handleSaveConfig = () => {
    const joinCfg = cfgJoinRelCol && cfgJoinTargetCols.length > 0
      ? { relationColumnId: cfgJoinRelCol, targetColumns: cfgJoinTargetCols }
      : undefined;
    const newConfig = encodeConfig({
      spaceSlug,
      dbId: cfgDbId,
      columns: cfgCols,
      filters: cfgFilters,
      sorts: cfgSorts,
      limit: cfgLimit,
      join: joinCfg,
    });
    updateAttributes({ config: newConfig });
    setConfigOpen(false);
    // Trigger re-fetch
    setLoading(true);
    setDb(null);
    setJoinedRows(null);
  };

  // ── Not configured yet ──────────────────────────────────────────────────────
  if (!dbId && !configOpen) {
    return (
      <NodeViewWrapper className="my-3" contentEditable={false}>
        <div className="et-block et-block-error" style={{ cursor: editable ? "pointer" : "default" }} onClick={() => { if (editable) setConfigOpen(true); }}>
          <DbIcon className="w-4 h-4" /> {editable ? "Click to configure query" : "Unconfigured query block"}
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Config panel ────────────────────────────────────────────────────────────
  if (configOpen) {
    const targetCols = cfgTargetDb?.columns || [];

    return (
      <NodeViewWrapper className="my-3" contentEditable={false}>
        <div className="et-block">
          <div className="et-block-header">
            <DbIcon className="w-4 h-4 text-accent" />
            <span className="et-block-title">Configure Query</span>
            <button className="et-display-btn" onClick={() => { if (dbId) setConfigOpen(false); }} title="Close config">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="qb-config">
            {/* Table picker */}
            <label className="qb-label">
              Table
              <select className="qb-select" value={cfgDbId} onChange={(e) => { setCfgDbId(e.target.value); setCfgCols([]); setCfgFilters([]); setCfgSorts([]); }}>
                <option value="">Select a table…</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </select>
            </label>

            {cfgDbId && targetCols.length > 0 && (
              <>
                {/* Column selection */}
                <div className="qb-section">
                  <span className="qb-section-title">Columns</span>
                  <div className="qb-checkboxes">
                    {targetCols.map((c) => (
                      <label key={c.id} className="qb-check">
                        <input
                          type="checkbox"
                          checked={cfgCols.length === 0 || cfgCols.includes(c.id)}
                          onChange={(e) => {
                            if (cfgCols.length === 0) {
                              // Switching from "all" to explicit: check all except this one
                              setCfgCols(e.target.checked ? [] : targetCols.filter((x) => x.id !== c.id).map((x) => x.id));
                            } else {
                              setCfgCols(e.target.checked ? [...cfgCols, c.id] : cfgCols.filter((id) => id !== c.id));
                            }
                          }}
                        />
                        {c.name}
                      </label>
                    ))}
                  </div>
                </div>

                {/* Filters */}
                <div className="qb-section">
                  <span className="qb-section-title">Filters</span>
                  {cfgFilters.map((f, i) => (
                    <div key={i} className="qb-filter-row">
                      <select className="qb-select qb-select-sm" value={f.columnId} onChange={(e) => {
                        const next = [...cfgFilters]; next[i] = { ...f, columnId: e.target.value }; setCfgFilters(next);
                      }}>
                        <option value="">Column…</option>
                        {targetCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select className="qb-select qb-select-sm" value={f.op} onChange={(e) => {
                        const next = [...cfgFilters]; next[i] = { ...f, op: e.target.value as DbFilterOp }; setCfgFilters(next);
                      }}>
                        {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {f.op !== "isEmpty" && f.op !== "isNotEmpty" && (() => {
                        const filterCol = targetCols.find((c) => c.id === f.columnId);
                        const hasOptions = filterCol && (filterCol.type === "select" || filterCol.type === "multiSelect" || filterCol.type === "tag");
                        const opts = filterCol?.options || [];
                        // For tag columns, collect unique tags from all rows in the target table
                        const tagOpts = filterCol?.type === "tag" && cfgTargetDb
                          ? [...new Set(cfgTargetDb.rows.flatMap((r) => {
                              const v = r.cells[filterCol.id];
                              return Array.isArray(v) ? v : v ? [String(v)] : [];
                            }))].sort()
                          : [];
                        const allOpts = filterCol?.type === "tag" ? tagOpts : opts;
                        if (hasOptions && allOpts.length > 0) {
                          return (
                            <select className="qb-select qb-select-sm" value={String(f.value ?? "")} onChange={(e) => {
                              const next = [...cfgFilters]; next[i] = { ...f, value: e.target.value }; setCfgFilters(next);
                            }}>
                              <option value="">Any…</option>
                              {allOpts.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          );
                        }
                        if (filterCol?.type === "checkbox") {
                          return (
                            <select className="qb-select qb-select-sm" value={String(f.value ?? "")} onChange={(e) => {
                              const next = [...cfgFilters]; next[i] = { ...f, value: e.target.value }; setCfgFilters(next);
                            }}>
                              <option value="true">Checked</option>
                              <option value="false">Unchecked</option>
                            </select>
                          );
                        }
                        return (
                          <input className="qb-input" value={String(f.value ?? "")} onChange={(e) => {
                            const next = [...cfgFilters]; next[i] = { ...f, value: e.target.value }; setCfgFilters(next);
                          }} placeholder="Value" />
                        );
                      })()}
                      <button className="qb-remove" onClick={() => setCfgFilters(cfgFilters.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button className="qb-add-btn" onClick={() => setCfgFilters([...cfgFilters, { columnId: targetCols[0]?.id || "", op: "eq", value: "" }])}>
                    <Plus className="w-3 h-3" /> Add filter
                  </button>
                </div>

                {/* Sorts */}
                <div className="qb-section">
                  <span className="qb-section-title">Sort</span>
                  {cfgSorts.map((s, i) => (
                    <div key={i} className="qb-filter-row">
                      <select className="qb-select qb-select-sm" value={s.columnId} onChange={(e) => {
                        const next = [...cfgSorts]; next[i] = { ...s, columnId: e.target.value }; setCfgSorts(next);
                      }}>
                        <option value="">Column…</option>
                        {targetCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <select className="qb-select qb-select-sm" value={s.dir} onChange={(e) => {
                        const next = [...cfgSorts]; next[i] = { ...s, dir: e.target.value as "asc" | "desc" }; setCfgSorts(next);
                      }}>
                        <option value="asc">Ascending</option>
                        <option value="desc">Descending</option>
                      </select>
                      <button className="qb-remove" onClick={() => setCfgSorts(cfgSorts.filter((_, j) => j !== i))}>
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button className="qb-add-btn" onClick={() => setCfgSorts([...cfgSorts, { columnId: targetCols[0]?.id || "", dir: "asc" }])}>
                    <Plus className="w-3 h-3" /> Add sort
                  </button>
                </div>

                {/* Join */}
                <div className="qb-section">
                  <span className="qb-section-title">Join Table</span>
                  <select className="qb-select" value={cfgJoinRelCol} onChange={(e) => { setCfgJoinRelCol(e.target.value); setCfgJoinTargetCols([]); }}>
                    <option value="">No join</option>
                    {targetCols.filter((c) => c.type === "relation" && c.relation).map((c) => (
                      <option key={c.id} value={c.id}>{c.name} →</option>
                    ))}
                  </select>
                  {cfgJoinRelCol && cfgJoinTargetDb && (
                    <div className="qb-checkboxes" style={{ marginTop: 4 }}>
                      <span className="text-[10px] text-text-muted" style={{ width: "100%" }}>Include columns from {cfgJoinTargetDb.title}:</span>
                      {cfgJoinTargetDb.columns.filter((c) => c.type !== "relation" && c.type !== "lookup").map((c) => (
                        <label key={c.id} className="qb-check">
                          <input
                            type="checkbox"
                            checked={cfgJoinTargetCols.includes(c.name)}
                            onChange={(e) => {
                              setCfgJoinTargetCols(e.target.checked ? [...cfgJoinTargetCols, c.name] : cfgJoinTargetCols.filter((n) => n !== c.name));
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Limit */}
                <label className="qb-label">
                  Row limit <span className="text-text-muted">(0 = all)</span>
                  <input type="number" className="qb-input" value={cfgLimit} min={0} onChange={(e) => setCfgLimit(parseInt(e.target.value) || 0)} />
                </label>

                <button className="qb-save-btn" onClick={handleSaveConfig}>Apply Query</button>
              </>
            )}
          </div>
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Loading / Error ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <NodeViewWrapper className="my-3" contentEditable={false}>
        <div className="et-block et-block-loading">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading query results…
        </div>
      </NodeViewWrapper>
    );
  }

  if (error || !db) {
    return (
      <NodeViewWrapper className="my-3" contentEditable={false}>
        <div className="et-block et-block-error">
          <DbIcon className="w-4 h-4" /> {error || "Table not found"}
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Results table ───────────────────────────────────────────────────────────
  const hasJoin = joinedRows !== null && joinedColumns.length > 0;
  const displayRows = hasJoin ? joinedRows! : results;
  const rowCount = displayRows.length;

  return (
    <NodeViewWrapper className="my-3" contentEditable={false}>
      <div className="et-block">
        <div className="et-block-header">
          <DbIcon className="w-4 h-4 text-accent" />
          <span className="et-block-title">
            {db.title}
            {hasJoin && <span className="qb-badge">⇒ {joinTargetTitle}</span>}
            {queryFilters.length > 0 && <span className="qb-badge">{queryFilters.length} filter{queryFilters.length > 1 ? "s" : ""}</span>}
            {limit > 0 && <span className="qb-badge">limit {limit}</span>}
          </span>
          <span className="text-[10px] text-text-muted">{rowCount} row{rowCount !== 1 ? "s" : ""}</span>
          {editable && (
            <button className="et-display-btn" onClick={() => {
              setCfgDbId(dbId);
              setCfgCols(selectedColumns);
              setCfgFilters(queryFilters);
              setCfgSorts(querySorts);
              setCfgLimit(limit);
              setCfgJoinRelCol(queryJoin?.relationColumnId || "");
              setCfgJoinTargetCols(queryJoin?.targetColumns || []);
              setConfigOpen(true);
            }} title="Configure query">
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {rowCount === 0 ? (
          <div className="qb-empty">No matching rows</div>
        ) : (
          <div className="et-table-wrap">
            <table className="qb-table">
              <thead>
                <tr>
                  {visibleCols.map((col) => (
                    <th key={col.id} className="qb-th">{col.name}</th>
                  ))}
                  {hasJoin && joinedColumns.map((jc) => (
                    <th key={`j_${jc.id}`} className="qb-th qb-th-joined">{joinTargetTitle}.{jc.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.id}>
                    {visibleCols.map((col) => {
                      const val = row.cells[col.id];
                      let display: string;
                      if (val == null || val === "") {
                        display = "—";
                      } else if (col.type === "relation" && col.relation) {
                        const labels = relationLabels[col.id] || {};
                        const ids = Array.isArray(val) ? val : [val];
                        const resolved = ids.map((id: string) => labels[id] || id);
                        display = resolved.join(", ");
                      } else if (Array.isArray(val)) {
                        display = val.join(", ");
                      } else {
                        display = String(val);
                      }
                      return (
                        <td key={col.id} className="qb-td">
                          {display === "—" ? <span className="et-cell-empty">—</span> : display}
                        </td>
                      );
                    })}
                    {hasJoin && joinedColumns.map((jc) => {
                      const jRow = row as { _joined?: Record<string, unknown> };
                      const jval = jRow._joined?.[jc.name];
                      const jdisp = jval == null || jval === "" ? "—" : Array.isArray(jval) ? jval.join(", ") : String(jval);
                      return (
                        <td key={`j_${jc.id}`} className="qb-td qb-td-joined">
                          {jdisp === "—" ? <span className="et-cell-empty">—</span> : jdisp}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}
