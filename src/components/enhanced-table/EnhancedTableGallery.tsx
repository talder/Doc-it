"use client";

import type { EnhancedTable, DbRow, DbView } from "@/lib/types";

interface Props {
  db: EnhancedTable;
  view: DbView;
  rows: DbRow[];
}

export default function DatabaseGallery({ db, view, rows }: Props) {
  const titleCol = db.columns.find((c) => c.type === "text") || db.columns[0];
  const urlCol = db.columns.find((c) => c.type === "url");
  const hidden = new Set(view.hiddenColumns || []);
  const visibleCols = db.columns.filter((c) => c.id !== titleCol?.id && !hidden.has(c.id));

  return (
    <div className="et-gallery">
      {rows.map((row) => {
        const coverUrl = urlCol ? String(row.cells[urlCol.id] || "") : "";
        return (
          <div key={row.id} className="et-gallery-card">
            {coverUrl && /^https?:\/\/.*\.(jpg|jpeg|png|gif|webp|svg)/i.test(coverUrl) && (
              <div className="et-gallery-cover">
                <img src={coverUrl} alt="" />
              </div>
            )}
            <div className="et-gallery-body">
              <div className="et-gallery-title">{String(row.cells[titleCol?.id || ""] || "Untitled")}</div>
              {visibleCols.slice(0, 4).map((c) => {
                const v = row.cells[c.id];
                if (v == null || v === "") return null;
                return (
                  <div key={c.id} className="et-gallery-field">
                    <span className="et-gallery-field-label">{c.name}</span>
                    <span className="et-gallery-field-value">
                      {c.type === "checkbox" ? (v ? "✓" : "✗") : String(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
