"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Show a lightweight "Copied!" toast anchored to the viewport bottom-center.
 *
 * Works in two modes:
 * 1. React hook: `const showCopyToast = useCopyToast()` — returns a trigger fn
 *    and renders the toast via the `<CopyToastPortal />` placed once in the tree.
 * 2. Plain DOM: `showCopyToastDOM()` — injects a temporary element directly
 *    (for non-React contexts like ProseMirror plugins).
 */

// ── Plain DOM version (non-React) ─────────────────────────────────────────────

export function showCopyToastDOM(message = "Copied!") {
  // Remove any existing toast first
  const existing = document.getElementById("copy-toast-dom");
  if (existing) existing.remove();

  const el = document.createElement("div");
  el.id = "copy-toast-dom";
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "50%",
    transform: "translateX(-50%) translateY(8px)",
    background: "var(--color-text-primary, #111)",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "500",
    padding: "6px 16px",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,.15)",
    zIndex: "99999",
    opacity: "0",
    transition: "opacity 150ms ease, transform 150ms ease",
    pointerEvents: "none",
  });
  document.body.appendChild(el);

  // Trigger enter animation
  requestAnimationFrame(() => {
    el.style.opacity = "1";
    el.style.transform = "translateX(-50%) translateY(0)";
  });

  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateX(-50%) translateY(8px)";
    setTimeout(() => el.remove(), 200);
  }, 1500);
}

// ── React hook version ─────────────────────────────────────────────────────────

let globalShow: ((msg?: string) => void) | null = null;

export function showCopyToast(message?: string) {
  if (globalShow) globalShow(message);
  else showCopyToastDOM(message);
}

export function CopyToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<string | null>(null);

  const show = useCallback((msg = "Copied!") => {
    setToast(msg);
  }, []);

  useEffect(() => {
    globalShow = show;
    return () => { globalShow = null; };
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1500);
    return () => clearTimeout(t);
  }, [toast]);

  return (
    <>
      {children}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: "var(--color-text-primary, #111)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            padding: "6px 16px",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,.15)",
            zIndex: 99999,
            pointerEvents: "none",
            animation: "copyToastIn 150ms ease",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
