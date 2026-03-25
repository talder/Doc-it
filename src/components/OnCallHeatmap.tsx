"use client";

interface OnCallHeatmapProps {
  counts: Record<string, number>; // YYYY-MM-DD -> count
}

function intensityClass(count: number): string {
  if (count === 0) return "oc-heat-0";
  if (count === 1) return "oc-heat-1";
  if (count === 2) return "oc-heat-2";
  return "oc-heat-3";
}

export default function OnCallHeatmap({ counts }: OnCallHeatmapProps) {
  // Sort dates ascending (oldest → newest)
  const days = Object.keys(counts).sort();

  // Split into 30-day blocks (oldest first)
  const blocks: string[][] = [];
  for (let i = 0; i < days.length; i += 30) {
    blocks.push(days.slice(i, i + 30));
  }

  return (
    <div>
      <h3 className="jp-section-title mb-2">Activity (last 90 days)</h3>
      {blocks.map((block, idx) => {
        const first = block[0];
        const last = block[block.length - 1];
        return (
          <div key={idx} className={idx > 0 ? "mt-2" : ""}>
            <p className="text-[10px] text-text-muted mb-1">{first} — {last}</p>
            <div className="oc-heatmap">
              {block.map((date) => {
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
        );
      })}
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
