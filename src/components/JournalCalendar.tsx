"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface JournalCalendarProps {
  entryDates: Set<string>; // Set of "YYYY-MM-DD"
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function toYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function JournalCalendar({ entryDates, selectedDate, onSelectDate }: JournalCalendarProps) {
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());

  const today = toYMD(new Date());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  // Monday=0 start
  let startIdx = firstDay.getDay() - 1;
  if (startIdx < 0) startIdx = 6;

  const days: (number | null)[] = [];
  for (let i = 0; i < startIdx; i++) days.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);

  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="jcal">
      <div className="jcal-header">
        <button onClick={prevMonth} className="jcal-nav"><ChevronLeft className="w-4 h-4" /></button>
        <span className="jcal-month">{monthLabel}</span>
        <button onClick={nextMonth} className="jcal-nav"><ChevronRight className="w-4 h-4" /></button>
      </div>
      <div className="jcal-grid">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="jcal-wd">{wd}</div>
        ))}
        {days.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} className="jcal-cell jcal-cell--empty" />;
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const hasEntry = entryDates.has(dateStr);
          const isToday = dateStr === today;
          const isSelected = dateStr === selectedDate;
          return (
            <button
              key={dateStr}
              className={`jcal-cell${isToday ? " jcal-cell--today" : ""}${isSelected ? " jcal-cell--selected" : ""}${hasEntry ? " jcal-cell--has" : ""}`}
              onClick={() => onSelectDate(dateStr)}
            >
              {day}
              {hasEntry && <span className="jcal-dot" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
