"use client";

import { useEffect } from "react";

/**
 * Installs global window.onerror and onunhandledrejection handlers
 * to catch non-React JS errors and report them to the crash log API.
 *
 * Render once in the root layout — produces no visible UI.
 */
export default function CrashReporter() {
  useEffect(() => {
    function reportError(message: string, stack?: string) {
      fetch("/api/crash-logs/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          stack,
          url: window.location.href,
        }),
      }).catch(() => {});
    }

    function onError(event: ErrorEvent) {
      reportError(
        event.message || "Unhandled client error",
        event.error?.stack
      );
    }

    function onRejection(event: PromiseRejectionEvent) {
      const err =
        event.reason instanceof Error
          ? event.reason
          : new Error(String(event.reason));
      reportError(err.message, err.stack);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
