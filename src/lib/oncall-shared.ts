/**
 * Client-safe on-call types and pure utility functions.
 * This file must NOT import any server-only modules (fs, config, better-sqlite3, etc.).
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OnCallEntry {
  id: string;             // ONC-000001
  registrar: string;      // username
  date: string;           // YYYY-MM-DD
  time: string;           // HH:MM
  description: string;    // HTML (TipTap)
  workingMinutes: number; // duration in minutes
  solution: string;       // HTML (TipTap), editable post-creation
  createdAt: string;      // ISO timestamp
  updatedAt: string;      // ISO timestamp, bumped on solution edit
}

export interface OnCallSettings {
  allowedUsers: string[];
  emailEnabled: boolean;
  emailRecipients: string[];
  emailSendTime: string;       // "HH:MM"
  lastWeeklyReportAt?: string; // ISO timestamp debounce
}

export interface OnCallData {
  nextNumber: number;
  entries: OnCallEntry[];
}

// ── Working Time ──────────────────────────────────────────────────────────────

/** Parse "1h30m", "45m", "2h", or plain digits (minutes) → number of minutes. */
export function parseWorkingTime(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  const hm = s.match(/^(?:(\d+)h)?(?:(\d+)m)?$/);
  if (hm && (hm[1] || hm[2])) {
    const h = parseInt(hm[1] ?? "0");
    const m = parseInt(hm[2] ?? "0");
    return h + m === 0 ? null : h * 60 + m;
  }
  const num = parseInt(s);
  return !isNaN(num) && num > 0 ? num : null;
}

/** Format minutes → "1h30m", "45m", or "2h". */
export function formatWorkingTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export function filterOnCallEntries(
  entries: OnCallEntry[],
  opts: { q?: string; from?: string; to?: string },
): OnCallEntry[] {
  let result = entries;
  if (opts.from) result = result.filter((e) => e.date >= opts.from!);
  if (opts.to) result = result.filter((e) => e.date <= opts.to!);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    result = result.filter(
      (e) =>
        e.id.toLowerCase().includes(q) ||
        e.registrar.toLowerCase().includes(q) ||
        e.description.replace(/<[^>]+>/g, " ").toLowerCase().includes(q) ||
        e.solution.replace(/<[^>]+>/g, " ").toLowerCase().includes(q),
    );
  }
  return result;
}

// ── Heatmap ───────────────────────────────────────────────────────────────────

/** Returns a map of YYYY-MM-DD → count for the last `days` days. */
export function getHeatmapCounts(entries: OnCallEntry[], days = 30): Record<string, number> {
  const counts: Record<string, number> = {};
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    counts[d.toISOString().slice(0, 10)] = 0;
  }
  for (const e of entries) {
    if (Object.prototype.hasOwnProperty.call(counts, e.date)) {
      counts[e.date]++;
    }
  }
  return counts;
}

// ── Weekly Email ──────────────────────────────────────────────────────────────

/** Previous Mon–Sun relative to `now`. */
export function getPreviousWeekRange(now: Date): { from: string; to: string } {
  const day = now.getDay(); // 0=Sun, 1=Mon…
  const daysToLastMon = day === 0 ? 6 : day - 1;
  const lastMon = new Date(now);
  lastMon.setDate(now.getDate() - daysToLastMon - 7);
  const lastSun = new Date(lastMon);
  lastSun.setDate(lastMon.getDate() + 6);
  return {
    from: lastMon.toISOString().slice(0, 10),
    to: lastSun.toISOString().slice(0, 10),
  };
}

/** Build the HTML body for the weekly digest email. */
export function buildWeeklyReportHtml(entries: OnCallEntry[], from: string, to: string): string {
  const totalMinutes = entries.reduce((s, e) => s + e.workingMinutes, 0);
  const plain = (html: string) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rows = entries
    .map(
      (e) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:0.8rem">${e.id}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${e.date} ${e.time}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${e.registrar}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;white-space:nowrap">${formatWorkingTime(e.workingMinutes)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${plain(e.description).slice(0, 120)}${plain(e.description).length > 120 ? "…" : ""}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${plain(e.solution).slice(0, 100)}${plain(e.solution).length > 100 ? "…" : ""}</td>
      </tr>`,
    )
    .join("");

  return `
<div style="font-family:sans-serif;max-width:900px;margin:0 auto;color:#111827">
  <h2 style="color:#1d4ed8;margin-bottom:4px">📞 On-Call Weekly Report</h2>
  <p style="color:#6b7280;margin-top:0">Period: <strong>${from}</strong> – <strong>${to}</strong></p>
  <p style="color:#374151">Total calls: <strong>${entries.length}</strong> &nbsp;|&nbsp; Total working time: <strong>${formatWorkingTime(totalMinutes)}</strong></p>
  ${
    entries.length === 0
      ? "<p style=\"color:#6b7280\">No on-call entries registered for this period.</p>"
      : `<table style="width:100%;border-collapse:collapse;font-size:0.875rem">
    <thead>
      <tr style="background:#f3f4f6">
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">ID</th>
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">Date / Time</th>
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">Registrar</th>
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">Time Spent</th>
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">Problem</th>
        <th style="padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">Solution</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
  }
</div>`;
}
