"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Pin, PinOff, Trash2, List, BookMarked, Lock, Globe } from "lucide-react";
import JournalCalendar from "@/components/JournalCalendar";
import JournalQuickEntry from "@/components/JournalQuickEntry";
import JournalListModal from "@/components/JournalListModal";
import type { JournalEntry, JournalTemplate } from "@/lib/journal";

type Scope = "user" | "space";

export default function JournalPage() {
  const router = useRouter();

  // Scope
  const [scope, setScope] = useState<Scope>("user");
  const [spaceSlug, setSpaceSlug] = useState<string | null>(null);

  // Data
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [templates, setTemplates] = useState<JournalTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);
  const [editContent, setEditContent] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editMood, setEditMood] = useState("");
  const [editTagInput, setEditTagInput] = useState("");
  const [showQuickEntry, setShowQuickEntry] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTplName, setNewTplName] = useState("");
  const [newTplContent, setNewTplContent] = useState("");
  const [saving, setSaving] = useState(false);

  // Fetch current space slug from localStorage
  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("doc-it-current-space") : null;
    if (stored) setSpaceSlug(stored);
  }, []);

  // Fetch entries + templates
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
      const [entriesRes, tplRes] = await Promise.all([
        fetch(`${base}/entries`),
        fetch(`${base}/templates`),
      ]);
      if (entriesRes.ok) {
        const data = await entriesRes.json();
        setEntries(data.entries || []);
      }
      if (tplRes.ok) {
        const data = await tplRes.json();
        setTemplates(data.templates || []);
      }
    } catch {}
    setLoading(false);
  }, [scope, spaceSlug]);

  useEffect(() => {
    if (scope === "space" && !spaceSlug) return;
    fetchData();
  }, [scope, spaceSlug, fetchData]);

  // Entry dates for calendar
  const entryDates = new Set(entries.map((e) => e.date));

  // Entries for selected date
  const dateEntries = selectedDate
    ? entries.filter((e) => e.date === selectedDate).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    : [];

  // Select entry for editing
  const openEntry = (entry: JournalEntry) => {
    setSelectedEntry(entry);
    setEditContent(entry.content);
    setEditTitle(entry.title);
    setEditTags([...entry.tags]);
    setEditMood(entry.mood);
  };

  // Save edited entry
  const saveEntry = async () => {
    if (!selectedEntry) return;
    setSaving(true);
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    await fetch(`${base}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: selectedEntry.id,
        title: editTitle,
        content: editContent,
        tags: editTags,
        mood: editMood,
      }),
    });
    setSaving(false);
    await fetchData();
    // Update selected
    setSelectedEntry((prev) => prev ? { ...prev, title: editTitle, content: editContent, tags: editTags, mood: editMood } : null);
  };

  // Toggle pin
  const togglePin = async (entry: JournalEntry) => {
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    await fetch(`${base}/entries`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, pinned: !entry.pinned }),
    });
    await fetchData();
  };

  // Delete entry
  const deleteEntry = async (entry: JournalEntry) => {
    if (!confirm("Delete this journal entry?")) return;
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    await fetch(`${base}/entries?id=${entry.id}`, { method: "DELETE" });
    if (selectedEntry?.id === entry.id) setSelectedEntry(null);
    await fetchData();
  };

  // Quick entry save
  const handleQuickSave = async (data: { date: string; title: string; content: string; tags: string[]; mood: string }) => {
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    await fetch(`${base}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await fetchData();
  };

  // Export
  const handleExport = (format: "md" | "json") => {
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    window.open(`${base}/export?format=${format}`, "_blank");
  };

  // Create template
  const handleCreateTemplate = async () => {
    if (!newTplName.trim() || !newTplContent.trim()) return;
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    await fetch(`${base}/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTplName, content: newTplContent }),
    });
    setNewTplName("");
    setNewTplContent("");
    setShowNewTemplate(false);
    await fetchData();
  };

  // Delete template
  const handleDeleteTemplate = async (id: string) => {
    const base = scope === "user" ? "/api/journal" : `/api/spaces/${spaceSlug}/journal`;
    await fetch(`${base}/templates?id=${id}`, { method: "DELETE" });
    await fetchData();
  };

  const MOODS = ["😊", "😐", "😟", "🔥", "💡", "🎯", "😴", "🚀"];

  return (
    <div className="jp-root">
      {/* Header */}
      <header className="jp-header">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <BookMarked className="w-5 h-5 text-accent" />
          <h1 className="text-lg font-bold text-text-primary">Journal</h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Scope toggle */}
          <div className="jp-scope-toggle">
            <button className={`jp-scope-btn${scope === "user" ? " jp-scope-btn--active" : ""}`} onClick={() => { setScope("user"); setSelectedEntry(null); }}>
              <Lock className="w-3.5 h-3.5" /> My Journal
            </button>
            <button className={`jp-scope-btn${scope === "space" ? " jp-scope-btn--active" : ""}`} onClick={() => { setScope("space"); setSelectedEntry(null); }} disabled={!spaceSlug}>
              <Globe className="w-3.5 h-3.5" /> Space Journal
            </button>
          </div>
          <button className="jp-action-btn" onClick={() => setShowListModal(true)}>
            <List className="w-4 h-4" /> All Entries
          </button>
          <button className="jp-action-btn jp-action-btn--primary" onClick={() => setShowQuickEntry(true)}>
            <Plus className="w-4 h-4" /> New Entry
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="jp-main">
        {/* Left sidebar: Calendar + Tags + Templates */}
        <aside className="jp-sidebar">
          <JournalCalendar
            entryDates={entryDates}
            selectedDate={selectedDate}
            onSelectDate={(d) => { setSelectedDate(d); setSelectedEntry(null); }}
          />

          {/* Tag cloud */}
          {entries.length > 0 && (() => {
            const tagCounts: Record<string, number> = {};
            entries.forEach((e) => e.tags.forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
            const tags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
            if (!tags.length) return null;
            return (
              <div className="jp-section">
                <h3 className="jp-section-title">Tags</h3>
                <div className="flex flex-wrap gap-1">
                  {tags.map(([tag, count]) => (
                    <button key={tag} className="jp-tag-btn" onClick={() => setSelectedDate(null)}>
                      #{tag} <span className="jp-tag-count">{count}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Templates */}
          <div className="jp-section">
            <div className="flex items-center justify-between mb-1">
              <h3 className="jp-section-title">Templates</h3>
              <button className="jp-tiny-btn" onClick={() => setShowNewTemplate(!showNewTemplate)}>
                {showNewTemplate ? "Cancel" : "+ New"}
              </button>
            </div>
            {showNewTemplate && (
              <div className="jp-tpl-form">
                <input
                  className="jp-tpl-input"
                  placeholder="Template name"
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                />
                <textarea
                  className="jp-tpl-textarea"
                  rows={3}
                  placeholder="Template content (markdown)…"
                  value={newTplContent}
                  onChange={(e) => setNewTplContent(e.target.value)}
                />
                <button className="jp-tpl-save" onClick={handleCreateTemplate}>Save Template</button>
              </div>
            )}
            {templates.map((tpl) => (
              <div key={tpl.id} className="jp-tpl-item">
                <span className="jp-tpl-name">{tpl.name}</span>
                <button className="jp-tpl-del" onClick={() => handleDeleteTemplate(tpl.id)}>×</button>
              </div>
            ))}
            {templates.length === 0 && !showNewTemplate && (
              <p className="text-xs text-text-muted">No templates yet</p>
            )}
          </div>
        </aside>

        {/* Center: Entry list or entry editor */}
        <main className="jp-content">
          {loading ? (
            <div className="jp-empty">Loading…</div>
          ) : selectedEntry ? (
            /* Entry editor */
            <div className="jp-editor">
              <div className="jp-editor-header">
                <button className="jp-back-link" onClick={() => setSelectedEntry(null)}>← Back to list</button>
                <div className="flex gap-1.5">
                  <button className="jp-icon-btn" onClick={() => togglePin(selectedEntry)} title={selectedEntry.pinned ? "Unpin" : "Pin"}>
                    {selectedEntry.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </button>
                  <button className="jp-icon-btn jp-icon-btn--danger" onClick={() => deleteEntry(selectedEntry)} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="jp-editor-fields">
                <input
                  className="jp-editor-title"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Entry title"
                />
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs text-text-muted">Mood:</span>
                  {MOODS.map((m) => (
                    <button key={m} className={`jqe-mood${editMood === m ? " jqe-mood--active" : ""}`} onClick={() => setEditMood(editMood === m ? "" : m)}>
                      {m}
                    </button>
                  ))}
                </div>
                <textarea
                  className="jp-editor-content"
                  rows={16}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="Write your journal entry…"
                />
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className="text-xs text-text-muted">Tags:</span>
                  {editTags.map((t) => (
                    <span key={t} className="jqe-tag">
                      #{t}
                      <button className="jqe-tag-rm" onClick={() => setEditTags(editTags.filter((x) => x !== t))}>×</button>
                    </span>
                  ))}
                  <input
                    className="jqe-tag-input"
                    placeholder="Add tag…"
                    value={editTagInput}
                    onChange={(e) => setEditTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const t = editTagInput.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
                        if (t && !editTags.includes(t)) setEditTags([...editTags, t]);
                        setEditTagInput("");
                      }
                    }}
                  />
                </div>
                <div className="mt-4 flex gap-2">
                  <button className="jp-save-btn" onClick={saveEntry} disabled={saving}>
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          ) : selectedDate ? (
            /* Date entries list */
            <div>
              <h2 className="jp-date-title">
                {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </h2>
              {dateEntries.length === 0 ? (
                <div className="jp-empty">
                  <p>No entries for this date</p>
                  <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowQuickEntry(true)}>
                    <Plus className="w-4 h-4" /> Create Entry
                  </button>
                </div>
              ) : (
                <div className="jp-entry-list">
                  {dateEntries.map((e) => (
                    <div key={e.id} className="jp-entry-card" onClick={() => openEntry(e)}>
                      <div className="jp-entry-card-top">
                        <span className="jp-entry-card-title">{e.title}</span>
                        <div className="flex items-center gap-1.5">
                          {e.mood && <span>{e.mood}</span>}
                          {e.pinned && <Pin className="w-3 h-3 text-accent" />}
                        </div>
                      </div>
                      {e.tags.length > 0 && (
                        <div className="jp-entry-card-tags">
                          {e.tags.map((t) => <span key={t}>#{t}</span>)}
                        </div>
                      )}
                      <p className="jp-entry-card-preview">{e.content.slice(0, 200)}{e.content.length > 200 ? "…" : ""}</p>
                      <span className="jp-entry-card-meta">by {e.author} · {new Date(e.updatedAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* No date selected */
            <div className="jp-empty">
              <BookMarked className="w-10 h-10 text-text-muted mb-3 opacity-40" />
              <p className="text-text-muted">Select a date on the calendar or create a new entry</p>
              <button className="jp-action-btn jp-action-btn--primary mt-3" onClick={() => setShowQuickEntry(true)}>
                <Plus className="w-4 h-4" /> New Entry
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Quick entry modal */}
      <JournalQuickEntry
        isOpen={showQuickEntry}
        onClose={() => setShowQuickEntry(false)}
        onSave={handleQuickSave}
        templates={templates}
        scope={scope}
      />

      {/* List modal */}
      <JournalListModal
        isOpen={showListModal}
        onClose={() => setShowListModal(false)}
        entries={entries}
        onSelect={(e) => { setSelectedDate(e.date); openEntry(e); }}
        onExport={handleExport}
        scope={scope}
      />
    </div>
  );
}
