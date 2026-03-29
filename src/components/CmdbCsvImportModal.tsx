"use client";

import { useEffect, useRef, useState } from "react";
import { X, Upload, FileSpreadsheet } from "lucide-react";
import type { CmdbContainer, CustomFieldDef } from "@/lib/cmdb";

const STANDARD_FIELDS = [
  { key: "name", label: "Name / Hostname *" },
  { key: "type", label: "Type" },
  { key: "ipAddresses", label: "IP Addresses" },
  { key: "os", label: "OS / Firmware" },
  { key: "location", label: "Location" },
  { key: "owner", label: "Owner" },
  { key: "status", label: "Status" },
  { key: "purchaseDate", label: "Purchase Date" },
  { key: "warrantyExpiry", label: "Warranty Expiry" },
  { key: "notes", label: "Notes" },
];

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if ((ch === "," || ch === ";") && !inQuote) { result.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    result.push(cur.trim());
    return result;
  };
  const headers = split(lines[0]);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

/** Build indented container options */
function containerOptions(containers: CmdbContainer[]): { id: string; label: string }[] {
  const childrenOf = (pid: string | null): CmdbContainer[] =>
    containers.filter((c) => c.parentId === pid).sort((a, b) => a.order - b.order);
  const result: { id: string; label: string }[] = [];
  const walk = (pid: string | null, depth: number) => {
    for (const c of childrenOf(pid)) {
      result.push({ id: c.id, label: "\u00A0\u00A0".repeat(depth) + c.name });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return result;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  containers: CmdbContainer[];
  customFieldDefs: CustomFieldDef[];
  onImport: (rows: Record<string, unknown>[]) => Promise<{ created: number; errors: string[] }>;
}

export default function CmdbCsvImportModal({ isOpen, onClose, containers, customFieldDefs, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [containerId, setContainerId] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setHeaders([]);
      setRows([]);
      setMapping({});
      setContainerId(containers[0]?.id || "");
      setImporting(false);
      setResult(null);
    }
  }, [isOpen, containers]);

  if (!isOpen) return null;

  const allFields = [
    { key: "__skip", label: "— Skip —" },
    ...STANDARD_FIELDS,
    ...customFieldDefs.map((d) => ({ key: `custom:${d.id}`, label: `[Custom] ${d.name}` })),
  ];

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCsv(text);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      // Auto-map by header name matching
      const auto: Record<number, string> = {};
      parsed.headers.forEach((h, i) => {
        const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
        const match = STANDARD_FIELDS.find((f) => f.key.toLowerCase() === lower || f.label.toLowerCase().replace(/[^a-z0-9]/g, "") === lower);
        if (match) auto[i] = match.key;
        else {
          const cfMatch = customFieldDefs.find((d) => d.name.toLowerCase().replace(/[^a-z0-9]/g, "") === lower);
          if (cfMatch) auto[i] = `custom:${cfMatch.id}`;
        }
      });
      setMapping(auto);
      setResult(null);
    };
    reader.readAsText(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!containerId) return;
    setImporting(true);
    const mapped = rows.map((row) => {
      const obj: Record<string, unknown> = { containerId };
      const customFields: Record<string, string> = {};
      headers.forEach((_, i) => {
        const field = mapping[i];
        if (!field || field === "__skip") return;
        const val = row[i] || "";
        if (field.startsWith("custom:")) {
          customFields[field.replace("custom:", "")] = val;
        } else if (field === "ipAddresses") {
          obj[field] = val.split(",").map((s) => s.trim()).filter(Boolean);
        } else {
          obj[field] = val;
        }
      });
      if (Object.keys(customFields).length > 0) obj.customFields = customFields;
      return obj;
    });
    const res = await onImport(mapped);
    setResult(res);
    setImporting(false);
  };

  const hasNameMapping = Object.values(mapping).includes("name");
  const cOpts = containerOptions(containers);

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title"><FileSpreadsheet className="w-4 h-4" /> Import Assets from CSV</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          {/* Step 1: File upload */}
          {headers.length === 0 && (
            <div
              className={`am-drop-zone${dragOver ? " am-drop-zone--active" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm text-text-muted">Drop a CSV file here or click to browse</p>
              <p className="text-xs text-text-muted mt-1">Supports comma and semicolon delimiters</p>
              <input ref={fileRef} type="file" accept=".csv,.txt" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {/* Step 2: Preview + Mapping */}
          {headers.length > 0 && !result && (
            <>
              <div className="mb-3">
                <label className="cl-label">Import into group *</label>
                <select className="cl-input" value={containerId} onChange={(e) => setContainerId(e.target.value)}>
                  <option value="" disabled>Select…</option>
                  {cOpts.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>

              <p className="text-xs text-text-muted mb-2">Map each CSV column to an asset field:</p>
              <div className="am-csv-map">
                {headers.map((h, i) => (
                  <div key={i} className="am-csv-map-row">
                    <span className="am-csv-col">{h}</span>
                    <span className="text-text-muted">→</span>
                    <select className="cl-input" style={{ flex: 1 }} value={mapping[i] || "__skip"} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))}>
                      {allFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <p className="text-xs text-text-muted mt-2 mb-1">Preview ({rows.length} rows):</p>
              <div className="am-csv-preview">
                <table className="cl-table">
                  <thead>
                    <tr>{headers.map((h, i) => <th key={i} className="cl-th">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((row, ri) => (
                      <tr key={ri}>{row.map((cell, ci) => <td key={ci} className="cl-td">{cell}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="cl-modal-footer">
                <button className="cl-btn cl-btn--secondary" onClick={() => { setHeaders([]); setRows([]); }}>← Back</button>
                <button className="cl-btn cl-btn--primary" disabled={!hasNameMapping || !containerId || importing} onClick={handleImport}>
                  {importing ? "Importing…" : `Import ${rows.length} assets`}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Result */}
          {result && (
            <div>
              <p className="text-sm text-text-primary mb-2">
                ✅ <strong>{result.created}</strong> assets imported successfully.
              </p>
              {result.errors.length > 0 && (
                <div className="am-csv-errors">
                  <p className="text-xs font-semibold text-red-600 mb-1">{result.errors.length} errors:</p>
                  {result.errors.map((e, i) => <p key={i} className="text-xs text-red-500">{e}</p>)}
                </div>
              )}
              <div className="cl-modal-footer">
                <button className="cl-btn cl-btn--primary" onClick={onClose}>Done</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
