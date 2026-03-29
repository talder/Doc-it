"use client";

import { useMemo } from "react";

interface OnCallHeatmapProps {
  counts: Record<string, number>; // YYYY-MM-DD -> count
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function intensityClass(count: number): string {
  if (count === 0) return "oc-heat-0";
  if (count === 1) return "oc-heat-1";
  if (count === 2) return "oc-heat-2";
  return "oc-heat-3";
}

export default function OnCallHeatmap({ counts }: OnCallHeatmapProps) {
  // Group dates by calendar month (oldest first)
  const months = useMemo(() => {
    const days = Object.keys(counts).sort();
    const grouped: { key: string; label: string; dates: string[] }[] = [];
    for (const date of days) {
      const ym = date.slice(0, 7); // YYYY-MM
      if (!grouped.length || grouped[grouped.length - 1].key !== ym) {
        const [y, m] = ym.split("-");
        grouped.push({ key: ym, label: `${MONTH_NAMES[parseInt(m, 10) - 1]} ${y}`, dates: [] });
      }
      grouped[grouped.length - 1].dates.push(date);
    }
    return grouped;
  }, [counts]);

  return (
    <div>
      <h3 className="jp-section-title mb-2">Activity ({new Date().getFullYear()})</h3>
      {months.map((month, idx) => (
        <div key={month.key} className={idx > 0 ? "mt-2" : ""}>
          <p className="text-[10px] text-text-muted mb-1 font-medium">{month.label}</p>
          <div className="oc-heatmap">
            {month.dates.map((date) => {
              const count = counts[date];
              return (
                <div
                  key={date}
                  className={`oc-heat-cell ${intensityClass(count)}`}
                  title={`${date}: ${count} call${count !== 1 ? "s" : ""}`}
                />
              );
            })}
          </div>
        </div>
      ))}
      <div className="oc-heat-legend">
        <span className="oc-heat-legend-label">Less</span>
        <div className="oc-heat-cell oc-heat-0 oc-heat-cell--sm" />
        <div className="oc-heat-cell oc-heat-1 oc-heat-cell--sm" />
        <div className="oc-heat-cell oc-heat-2 oc-heat-cell--sm" />
        <div className="oc-heat-cell oc-heat-3 oc-heat-cell--sm" />
        <span className="oc-heat-legend-label">More</span>
      </div>
    </div>
  );
}
