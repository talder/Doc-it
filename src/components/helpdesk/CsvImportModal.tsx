"use client";

import { useRef, useState } from "react";
import { X, Upload, AlertTriangle, CheckCircle } from "lucide-react";

interface CsvImportModalProps {
  onClose: () => void;
}

export default function CsvImportModal({ onClose }: CsvImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/helpdesk/import-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        setResult({ imported: 0, errors: ["Server error: " + res.statusText] });
      }
    } catch (e) {
      setResult({ imported: 0, errors: [(e as Error).message] });
    }
    setImporting(false);
  };

  return (
    <div className="cl-modal-overlay" onClick={onClose}>
      <div className="cl-modal" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="cl-modal-header">
          <h2 className="cl-modal-title">Import Tickets from CSV</h2>
          <button onClick={onClose} className="cl-modal-close"><X className="w-4 h-4" /></button>
        </div>
        <div className="cl-modal-body">
          {!result ? (
            <>
              <p className="text-sm text-text-secondary mb-3">
                Upload a CSV file with at least a <code>subject</code> column. Optional columns:
                description, ticketType, priority, impact, urgency, category, assignedGroup, assignedTo, requester, requesterEmail, tags.
              </p>
              <div className="cl-field">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="cl-input"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </div>
              {file && (
                <p className="text-xs text-text-muted mt-2">
                  Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </>
          ) : (
            <div>
              {result.imported > 0 && (
                <div className="flex items-center gap-2 text-sm mb-2" style={{ color: "#22c55e" }}>
                  <CheckCircle className="w-4 h-4" /> {result.imported} ticket(s) imported successfully
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 text-sm mb-1" style={{ color: "#ef4444" }}>
                    <AlertTriangle className="w-4 h-4" /> {result.errors.length} error(s)
                  </div>
                  <ul className="text-xs text-text-muted" style={{ maxHeight: 150, overflowY: "auto" }}>
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="cl-modal-footer">
          {!result ? (
            <>
              <button className="cl-btn cl-btn--secondary" onClick={onClose}>Cancel</button>
              <button className="cl-btn cl-btn--primary" disabled={!file || importing} onClick={handleImport}>
                <Upload className="w-3.5 h-3.5" /> {importing ? "Importing…" : "Import"}
              </button>
            </>
          ) : (
            <button className="cl-btn cl-btn--primary" onClick={onClose}>Done</button>
          )}
        </div>
      </div>
    </div>
  );
}
