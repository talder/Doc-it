"use client";

import { useEffect } from "react";

/**
 * Next.js App Router global error boundary.
 * Catches React rendering errors in the root layout.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Report to crash log API
    fetch("/api/crash-logs/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message || "Unknown rendering error",
        stack: error.stack,
        url: typeof window !== "undefined" ? window.location.href : undefined,
      }),
    }).catch(() => {});
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "system-ui, -apple-system, sans-serif",
            background: "#f9fafb",
            padding: "2rem",
          }}
        >
          <div style={{ maxWidth: 480, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>💥</div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
              Something went wrong
            </h1>
            <p style={{ color: "#6b7280", fontSize: 14, margin: "0 0 24px" }}>
              An unexpected error occurred. The crash has been logged automatically.
            </p>
            <button
              onClick={reset}
              style={{
                padding: "10px 24px",
                fontSize: 14,
                fontWeight: 600,
                color: "#fff",
                background: "#2563eb",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
