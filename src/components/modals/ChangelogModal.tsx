"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Marked } from "marked";

const marked = new Marked();

interface Props {
  onClose: () => void;
}

export default function ChangelogModal({ onClose }: Props) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/release-notes")
      .then((r) => r.json())
      .then((d) => {
        const rendered = marked.parse(d.content ?? "", { async: false }) as string;
        setHtml(rendered);
      })
      .catch(() => setHtml("<p>Could not load release notes.</p>"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-container max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Release Notes</h2>
          <button onClick={onClose} className="modal-close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="modal-body overflow-y-auto max-h-[70vh]">
          {loading ? (
            <p className="text-sm text-text-muted animate-pulse">Loading…</p>
          ) : (
            <div
              className="prose prose-sm max-w-none text-text-primary"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
