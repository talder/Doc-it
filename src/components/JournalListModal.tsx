"use client";

import { useState } from "react";
import { X, Download, Pin, Search } from "lucide-react";
import type { JournalEntry } from "@/lib/journal";

interface JournalListModalProps {
  isOpen: boolean;
  onClose: () => void;
  entries: JournalEntry[];
  onSelect: (entry: JournalEntry) => void;
  onExport: (format: "md" | "json") => void;
  scope: "user" | "space";
}

export default function JournalListModal({ isOpen, onClose, entries, onSelect, onExport, scope }: JournalListModalProps) {
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  if (!isOpen) return null;

  // Collect all tags
  const allTags = [...new Set(entries.flatMap((e) => e.tags))].sort();

  let filtered = entries;
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(
      (e) => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q),
    );
  }
  if (tagFilter) {
    filtered = filtered.filter((e) => e.tags.includes(tagFilter));
  }

  // Sort: pinned first, then newest
  filtered.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.date.localeCompare(a.date);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="jlm-card" onClick={(e) => e.stopPropagation()}>
        <div className="jlm-header">
          <h2 className="text-base font-semibold text-text-primary">
            {scope === "user" ? "🔒 My Journal" : "📝 Space Journal"} — All Entries
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
        </div>

        {/* Filters */}
        <div className="jlm-filters">
          <div className="jlm-search-wrap">
            <Search className="w-4 h-4 text-text-muted" />
            <input
              type="text"
              className="jlm-search"
              placeholder="Search entries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {allTags.length > 0 && (
            <select
              className="jlm-tag-filter"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
            >
              <option value="">All tags</option>
              {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
            </select>
          )}
        </div>

        {/* List */}
        <div className="jlm-list">
          {filtered.length === 0 ? (
            <div className="jlm-empty">No entries found</div>
          ) : (
            filtered.map((e) => (
              <button key={e.id} className="jlm-item" onClick={() => { onSelect(e); onClose(); }}>
                <div className="jlm-item-top">
                  <span className="jlm-item-date">{e.date}</span>
                  {e.mood && <span className="jlm-item-mood">{e.mood}</span>}
                  {e.pinned && <Pin className="w-3 h-3 text-accent" />}
                </div>
                <p className="jlm-item-title">{e.title}</p>
                {e.tags.length > 0 && (
                  <div className="jlm-item-tags">
                    {e.tags.map((t) => <span key={t} className="jlm-item-tag">#{t}</span>)}
                  </div>
                )}
                <p className="jlm-item-preview">{e.content.slice(0, 120)}{e.content.length > 120 ? "…" : ""}</p>
              </button>
            ))
          )}
        </div>

        {/* Footer with export */}
        <div className="jlm-footer">
          <span className="text-xs text-text-muted">{filtered.length} entries</span>
          <div className="flex gap-2">
            <button className="jlm-export" onClick={() => onExport("md")}>
              <Download className="w-3.5 h-3.5" /> Export MD
            </button>
            <button className="jlm-export" onClick={() => onExport("json")}>
              <Download className="w-3.5 h-3.5" /> Export JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
