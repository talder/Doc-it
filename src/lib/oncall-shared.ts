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
  assistedBy: string[];   // usernames of persons called for assistance
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

/** Build the HTML body for the weekly digest email (per-registrar breakdown). */
export function buildWeeklyReportHtml(entries: OnCallEntry[], from: string, to: string): string {
  const totalMinutes = entries.reduce((s, e) => s + e.workingMinutes, 0);
  const plain = (html: string) =>
    html
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (entries.length === 0) {
    return `
<div style="font-family:sans-serif;max-width:900px;margin:0 auto;color:#111827">
  <h2 style="color:#1d4ed8;margin-bottom:4px">📞 On-Call Weekly Report</h2>
  <p style="color:#6b7280;margin-top:0">Period: <strong>${from}</strong> – <strong>${to}</strong></p>
  <p style="color:#6b7280">No on-call entries registered for this period.</p>
</div>`;
  }

  // Group entries by registrar
  const byRegistrar = new Map<string, OnCallEntry[]>();
  for (const e of entries) {
    const arr = byRegistrar.get(e.registrar) ?? [];
    arr.push(e);
    byRegistrar.set(e.registrar, arr);
  }

  const thStyle = `padding:8px 12px;text-align:left;font-size:0.7rem;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase`;
  const tdStyle = `padding:6px 12px;border-bottom:1px solid #e5e7eb`;

  /** Classify a YYYY-MM-DD date string into weekday/saturday/sunday. */
  const dayCategory = (dateStr: string): "weekday" | "saturday" | "sunday" => {
    const d = new Date(dateStr + "T00:00:00");
    const dow = d.getDay(); // 0=Sun, 6=Sat
    if (dow === 0) return "sunday";
    if (dow === 6) return "saturday";
    return "weekday";
  };

  const registrarSections = Array.from(byRegistrar.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([registrar, regEntries]) => {
      const regTotal = regEntries.reduce((s, e) => s + e.workingMinutes, 0);
      let weekdayMin = 0, saturdayMin = 0, sundayMin = 0;
      for (const e of regEntries) {
        const cat = dayCategory(e.date);
        if (cat === "weekday") weekdayMin += e.workingMinutes;
        else if (cat === "saturday") saturdayMin += e.workingMinutes;
        else sundayMin += e.workingMinutes;
      }

      // Calls table rows
      const rows = regEntries
        .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
        .map(
          (e) => `
      <tr>
        <td style="${tdStyle};font-family:monospace;font-size:0.8rem">${e.id}</td>
        <td style="${tdStyle}">${e.date} ${e.time}</td>
        <td style="${tdStyle};white-space:nowrap">${formatWorkingTime(e.workingMinutes)}</td>
        <td style="${tdStyle}">${(e.assistedBy ?? []).join(", ") || "—"}</td>
        <td style="${tdStyle}">${plain(e.description).slice(0, 120)}${plain(e.description).length > 120 ? "…" : ""}</td>
        <td style="${tdStyle}">${plain(e.solution).slice(0, 100)}${plain(e.solution).length > 100 ? "…" : ""}</td>
      </tr>`,
        )
        .join("");

      // Assistance tally: count how many calls each person assisted on
      const assistCounts = new Map<string, number>();
      for (const e of regEntries) {
        for (const u of e.assistedBy ?? []) {
          assistCounts.set(u, (assistCounts.get(u) ?? 0) + 1);
        }
      }
      const assistRows = Array.from(assistCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .map(
          ([name, count]) => `
      <tr>
        <td style="${tdStyle}">${name}</td>
        <td style="${tdStyle};text-align:center">${count}</td>
      </tr>`,
        )
        .join("");

      return `
  <div style="margin-top:28px;padding-top:20px;border-top:2px solid #e5e7eb">
    <h3 style="color:#1d4ed8;margin-bottom:4px">👤 ${registrar}</h3>
    <p style="color:#374151;margin-top:4px">Calls: <strong>${regEntries.length}</strong> &nbsp;|&nbsp; Total time: <strong>${formatWorkingTime(regTotal)}</strong></p>

    <table style="width:100%;border-collapse:collapse;font-size:0.875rem;margin-bottom:16px">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="${thStyle}">ID</th>
          <th style="${thStyle}">Date / Time</th>
          <th style="${thStyle}">Time Spent</th>
          <th style="${thStyle}">Assisted By</th>
          <th style="${thStyle}">Problem</th>
          <th style="${thStyle}">Solution</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <h4 style="color:#374151;font-size:0.85rem;margin-bottom:6px">⏱ Time Breakdown</h4>
    <table style="border-collapse:collapse;font-size:0.85rem;margin-bottom:16px">
      <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Mon – Fri</td><td style="font-weight:600">${formatWorkingTime(weekdayMin)}</td></tr>
      <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Saturday</td><td style="font-weight:600">${formatWorkingTime(saturdayMin)}</td></tr>
      <tr><td style="padding:3px 16px 3px 0;color:#6b7280">Sunday</td><td style="font-weight:600">${formatWorkingTime(sundayMin)}</td></tr>
      <tr style="border-top:1px solid #e5e7eb"><td style="padding:5px 16px 3px 0;color:#374151;font-weight:600">Total</td><td style="padding-top:5px;font-weight:700">${formatWorkingTime(regTotal)}</td></tr>
    </table>

    ${assistCounts.size > 0 ? `
    <h4 style="color:#374151;font-size:0.85rem;margin-bottom:6px">🤝 Assistance Overview</h4>
    <table style="border-collapse:collapse;font-size:0.85rem">
      <thead>
        <tr style="background:#f3f4f6">
          <th style="${thStyle}">Person</th>
          <th style="${thStyle};text-align:center">Calls Assisted</th>
        </tr>
      </thead>
      <tbody>${assistRows}</tbody>
    </table>` : ""}
  </div>`;
    })
    .join("");

  return `
<div style="font-family:sans-serif;max-width:900px;margin:0 auto;color:#111827">
  <h2 style="color:#1d4ed8;margin-bottom:4px">📞 On-Call Weekly Report</h2>
  <p style="color:#6b7280;margin-top:0">Period: <strong>${from}</strong> – <strong>${to}</strong></p>
  <p style="color:#374151">Total calls: <strong>${entries.length}</strong> &nbsp;|&nbsp; Total working time: <strong>${formatWorkingTime(totalMinutes)}</strong></p>
  ${registrarSections}
</div>`;
}
