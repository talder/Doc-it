"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { JournalTemplate } from "@/lib/journal";
import JournalEditor from "@/components/JournalEditor";

interface JournalQuickEntryProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: { date: string; title: string; content: string; tags: string[]; mood: string }) => void;
  templates: JournalTemplate[];
  scope: "user" | "space";
}

const MOODS = ["😊", "😐", "😟", "🔥", "💡", "🎯", "😴", "🚀"];

export default function JournalQuickEntry({ isOpen, onClose, onSave, templates, scope }: JournalQuickEntryProps) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [mood, setMood] = useState("");

  if (!isOpen) return null;

  const handleAddTag = () => {
    const t = tagInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput("");
  };

  const handleSubmit = () => {
    if (!content.trim()) return;
    onSave({ date, title: title || "", content, tags, mood });
    // Reset
    setTitle("");
    setContent("");
    setTags([]);
    setMood("");
    setTagInput("");
    setDate(new Date().toISOString().slice(0, 10));
    onClose();
  };

  const handleTemplate = (tpl: JournalTemplate) => {
    setContent(tpl.content);
    if (tpl.tags.length) setTags([...new Set([...tags, ...tpl.tags])]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="jqe-card" onClick={(e) => e.stopPropagation()}>
        <div className="jqe-header">
          <h2 className="text-base font-semibold text-text-primary">
            {scope === "user" ? "🔒 Private Journal Entry" : "📝 Space Journal Entry"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-text-muted"><X className="w-4 h-4" /></button>
        </div>

        <div className="jqe-body">
          {/* Date + Mood row */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-text-secondary block mb-1">Date</label>
              <input
                type="date"
                className="jqe-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Mood</label>
              <div className="flex gap-1">
                {MOODS.map((m) => (
                  <button
                    key={m}
                    className={`jqe-mood${mood === m ? " jqe-mood--active" : ""}`}
                    onClick={() => setMood(mood === m ? "" : m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Title <span className="text-text-muted font-normal">(optional)</span></label>
            <input
              type="text"
              className="jqe-input"
              placeholder="Auto-generated from date if empty"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="text-xs font-medium text-text-secondary block mb-1">Use template</label>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((tpl) => (
                  <button
                    key={tpl.id}
                    className="jqe-tpl-btn"
                    onClick={() => handleTemplate(tpl)}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Content */}
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Content</label>
            <JournalEditor value={content} onChange={setContent} minHeight={180} />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-text-secondary block mb-1">Tags</label>
            <div className="flex items-center gap-2 flex-wrap">
              {tags.map((t) => (
                <span key={t} className="jqe-tag">
                  #{t}
                  <button className="jqe-tag-rm" onClick={() => setTags(tags.filter((x) => x !== t))}>×</button>
                </span>
              ))}
              <input
                type="text"
                className="jqe-tag-input"
                placeholder="Add tag…"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(); } }}
              />
            </div>
          </div>
        </div>

        <div className="jqe-footer">
          <button className="jqe-cancel" onClick={onClose}>Cancel</button>
          <button className="jqe-save" onClick={handleSubmit} disabled={!content.trim()}>
            Save Entry
          </button>
        </div>
      </div>
    </div>
  );
}
