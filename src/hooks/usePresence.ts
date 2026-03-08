"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const HEARTBEAT_MS = 15_000;

interface UsePresenceOptions {
  spaceSlug: string | undefined;
  docName: string | undefined;
  category: string | undefined;
  username: string | undefined;
  /** Only track presence when the user is actively editing */
  isEditing: boolean;
}

interface UsePresenceResult {
  /** Other users currently editing (excludes current user) */
  otherEditors: string[];
  /** Whether at least one other user is editing */
  hasOtherEditors: boolean;
}

export function usePresence({
  spaceSlug,
  docName,
  category,
  username,
  isEditing,
}: UsePresenceOptions): UsePresenceResult {
  const [editors, setEditors] = useState<string[]>([]);
  const esRef = useRef<EventSource | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);

  const presenceUrl = spaceSlug && docName
    ? `/api/spaces/${encodeURIComponent(spaceSlug)}/docs/${encodeURIComponent(docName)}/presence`
    : null;

  const streamUrl = spaceSlug && docName && category !== undefined
    ? `/api/spaces/${encodeURIComponent(spaceSlug)}/docs/${encodeURIComponent(docName)}/presence/stream?category=${encodeURIComponent(category || "")}`
    : null;

  // POST helper
  const sendAction = useCallback(
    (action: "join" | "leave" | "heartbeat") => {
      if (!presenceUrl || !category === undefined) return;
      fetch(presenceUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, action }),
      }).catch(() => {});
    },
    [presenceUrl, category]
  );

  // Always connect SSE to observe who is editing (even when not editing ourselves)
  useEffect(() => {
    if (!streamUrl) { setEditors([]); return; }

    let closed = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (closed) return;
      const es = new EventSource(streamUrl!);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (Array.isArray(data.editors)) {
            setEditors(data.editors);
          }
        } catch { /* ignore parse errors */ }
      };

      es.onerror = () => {
        // Close immediately to prevent EventSource auto-reconnect flood
        es.close();
        esRef.current = null;
        // Retry after a delay
        if (!closed) {
          retryTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [streamUrl]);

  // Join/leave based on editing state
  useEffect(() => {
    if (!presenceUrl || !username) return;

    if (isEditing) {
      activeRef.current = true;
      sendAction("join");

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        sendAction("heartbeat");
      }, HEARTBEAT_MS);
    }

    return () => {
      if (activeRef.current) {
        activeRef.current = false;
        sendAction("leave");
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [isEditing, presenceUrl, username, sendAction]);

  // Also send leave on page unload as a best-effort
  useEffect(() => {
    if (!presenceUrl || !username) return;

    const handleUnload = () => {
      if (activeRef.current) {
        // navigator.sendBeacon for reliability during unload
        const body = JSON.stringify({ category, action: "leave" });
        navigator.sendBeacon(presenceUrl, new Blob([body], { type: "application/json" }));
      }
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [presenceUrl, category, username]);

  const otherEditors = username
    ? editors.filter((e) => e !== username)
    : editors;

  return {
    otherEditors,
    hasOtherEditors: otherEditors.length > 0,
  };
}
