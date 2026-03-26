"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { EnhancedTable, DbRow, DbView } from "@/lib/types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  db: EnhancedTable;
  view: DbView;
  rows: DbRow[];
  canWrite: boolean;
  onAddRow: (cells?: Record<string, unknown>) => void;
}

export default function DatabaseCalendar({ db, view, rows, canWrite, onAddRow }: Props) {
  const dateCol = db.columns.find((c) => c.id === view.groupBy && c.type === "date");
  const titleCol = db.columns.find((c) => c.type === "text") || db.columns[0];
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  if (!dateCol) {
    return (
      <div className="et-kanban-empty">
        <p className="text-sm text-text-muted">Calendar view requires a Date column to group by.</p>
      </div>
    );
  }

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const getRowsForDay = (day: number) => {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return rows.filter((r) => String(r.cells[dateCol.id] || "").startsWith(dateStr));
  };

  const prev = () => setCurrentMonth(new Date(year, month - 1, 1));
  const next = () => setCurrentMonth(new Date(year, month + 1, 1));
  const today = () => { const n = new Date(); setCurrentMonth(new Date(n.getFullYear(), n.getMonth(), 1)); };

  const monthLabel = currentMonth.toLocaleDateString(undefined, { year: "numeric", month: "long" });

  return (
    <div className="et-calendar">
      <div className="et-calendar-header">
        <button className="et-calendar-nav" onClick={prev}><ChevronLeft className="w-4 h-4" /></button>
        <button className="et-calendar-today" onClick={today}>{monthLabel}</button>
        <button className="et-calendar-nav" onClick={next}><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="et-calendar-grid">
        {DAYS.map((d) => <div key={d} className="et-calendar-day-name">{d}</div>)}
        {cells.map((day, i) => (
          <div key={i} className={`et-calendar-cell${day === null ? " empty" : ""}`}>
            {day !== null && (
              <>
                <span className="et-calendar-date">{day}</span>
                <div className="et-calendar-items">
                  {getRowsForDay(day).slice(0, 3).map((r) => (
                    <div key={r.id} className="et-calendar-item">{String(r.cells[titleCol?.id || ""] || "")}</div>
                  ))}
                  {getRowsForDay(day).length > 3 && (
                    <div className="et-calendar-more">+{getRowsForDay(day).length - 3} more</div>
                  )}
                </div>
                {canWrite && (
                  <button
                    className="et-calendar-add"
                    onClick={() => onAddRow({ [dateCol.id]: `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}` })}
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
