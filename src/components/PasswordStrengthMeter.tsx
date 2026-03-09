"use client";

import { PASSWORD_RULES, type PasswordContext } from "@/lib/password-policy";

interface Props {
  password: string;
  context?: PasswordContext;
}

export default function PasswordStrengthMeter({ password, context = {} }: Props) {
  if (!password) return null;

  const results = PASSWORD_RULES.map((rule) => ({
    ...rule,
    passed: rule.test(password, context),
  }));

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  // Strength bar: 0-2 = weak (red), 3-5 = fair (amber), 6-7 = good (blue), 8 = strong (green)
  const pct = Math.round((passed / total) * 100);
  const barColor =
    passed <= 2
      ? "#dc2626"
      : passed <= 5
      ? "#f59e0b"
      : passed <= 6
      ? "#3b82f6"
      : "#16a34a";
  const label =
    passed <= 2
      ? "Weak"
      : passed <= 5
      ? "Fair"
      : passed <= 6
      ? "Good"
      : "Strong";

  return (
    <div style={{ marginTop: 8 }}>
      {/* Strength bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            flex: 1,
            height: 4,
            background: "var(--color-border, #e2e8f0)",
            borderRadius: 9999,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              borderRadius: 9999,
              transition: "width 0.3s, background 0.3s",
            }}
          />
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, color: barColor, minWidth: 40 }}>
          {label}
        </span>
      </div>

      {/* Rule checklist */}
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        {results.map((rule) => (
          <li
            key={rule.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: rule.passed ? "#16a34a" : "var(--color-text-muted, #94a3b8)",
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>
              {rule.passed ? "✓" : "○"}
            </span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
