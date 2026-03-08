"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface WatchedDoc {
  spaceSlug: string;
  docName: string;
  category: string;
}

interface UseDocWatcherOptions {
  username: string | undefined;
  onAvailable: (doc: WatchedDoc) => void;
}

/**
 * Watches a set of documents via a **single** multiplexed SSE connection.
 * Fires `onAvailable` when all other editors leave a watched doc.
 * The connection is re-established whenever the watch list changes.
 */
export function useDocWatcher({ username, onAvailable }: UseDocWatcherOptions) {
  const [watchList, setWatchList] = useState<WatchedDoc[]>([]);
  const onAvailableRef = useRef(onAvailable);
  onAvailableRef.current = onAvailable;

  // Stable key for a doc
  const docKey = (d: WatchedDoc) => `${d.spaceSlug}/${d.category}/${d.docName}`;

  const watch = useCallback((doc: WatchedDoc) => {
    setWatchList((prev) => {
      const key = `${doc.spaceSlug}/${doc.category}/${doc.docName}`;
      if (prev.some((d) => `${d.spaceSlug}/${d.category}/${d.docName}` === key)) return prev;
      return [...prev, doc];
    });
  }, []);

  const unwatch = useCallback((doc: WatchedDoc) => {
    setWatchList((prev) => {
      const key = `${doc.spaceSlug}/${doc.category}/${doc.docName}`;
      return prev.filter((d) => `${d.spaceSlug}/${d.category}/${d.docName}` !== key);
    });
  }, []);

  const unwatchAll = useCallback(() => setWatchList([]), []);

  // Keep a ref to the current watchList so the SSE handler can read it
  // without triggering reconnection on every state update.
  const watchListRef = useRef<WatchedDoc[]>(watchList);
  watchListRef.current = watchList;

  // Single multiplexed SSE connection
  const esRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Nothing to watch — make sure any old connection is closed
    if (watchList.length === 0) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    // Build the doc keys query param
    const keys = watchList.map(docKey);
    const url = `/api/presence/watch-stream?docs=${keys.map(encodeURIComponent).join(",")}`;

    let closed = false;

    function connect() {
      if (closed) return;

      // Close previous connection if any
      esRef.current?.close();

      const es = new EventSource(url);
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { docKey: string; editors: string[] };
          if (!Array.isArray(data.editors)) return;

          const others = username
            ? data.editors.filter((e: string) => e !== username)
            : data.editors;

          if (others.length === 0) {
            // Doc is free — find the matching WatchedDoc and fire callback
            const current = watchListRef.current;
            const match = current.find((d) => docKey(d) === data.docKey);
            if (match) {
              onAvailableRef.current(match);
              // Remove from watch list (will trigger reconnect without this doc)
              setWatchList((prev) => prev.filter((d) => docKey(d) !== data.docKey));
            }
          }
        } catch {
          /* ignore */
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!closed) {
          retryTimerRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      closed = true;
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      esRef.current?.close();
      esRef.current = null;
    };
  }, [watchList, username]);

  return { watchList, watch, unwatch, unwatchAll };
}
