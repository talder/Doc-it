/**
 * Client-safe CSV utilities for enhanced table import/export.
 */

/** Escape a cell value for CSV (RFC 4180) */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Generate a CSV string from column names and row data. */
export function generateCSV(
  columns: { id: string; name: string }[],
  rows: { cells: Record<string, unknown> }[],
): string {
  const header = columns.map((c) => escapeCSV(c.name)).join(",");
  const lines = rows.map((row) =>
    columns
      .map((col) => {
        const val = row.cells[col.id];
        if (val == null) return "";
        if (Array.isArray(val)) return escapeCSV(val.join(", "));
        return escapeCSV(String(val));
      })
      .join(",")
  );
  return [header, ...lines].join("\n");
}

/** Trigger a browser download of a CSV string. */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse a CSV string into an array of header names and row objects. */
export function parseCSV(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(current.trim());
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ""; });
    return obj;
  });

  return { headers, rows };
}
