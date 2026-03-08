"use client";

import { useState, useEffect } from "react";
import { Database, Bug, Users, FolderKanban, CalendarDays, X } from "lucide-react";

const TEMPLATES = [
  { id: "", label: "Empty", description: "Blank database with default columns", icon: Database },
  { id: "bug-tracker", label: "Bug Tracker", description: "Title, Status, Priority, Assignee, Due Date", icon: Bug },
  { id: "project-tracker", label: "Project Tracker", description: "Task, Status, Owner, Start/End Date, Progress", icon: FolderKanban },
  { id: "meeting-notes", label: "Meeting Notes", description: "Topic, Date, Attendees, Notes, Action Items", icon: Users },
  { id: "content-calendar", label: "Content Calendar", description: "Title, Status, Author, Publish Date, Channel", icon: CalendarDays },
];

interface DatabaseCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (title: string, templateId: string) => void;
  mode?: "create" | "edit";
  initialTitle?: string;
}

export default function DatabaseCreateModal({ isOpen, onClose, onCreate, mode = "create", initialTitle = "" }: DatabaseCreateModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setSelectedTemplate("");
    }
  }, [isOpen, initialTitle]);

  if (!isOpen) return null;

  const isEdit = mode === "edit";

  const handleCreate = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), selectedTemplate);
    setTitle("");
    setSelectedTemplate("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-text-primary">{isEdit ? "Edit Database" : "Create Database"}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Database Name</label>
            <input
              autoFocus
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-input-bg text-text-primary outline-none focus:border-accent"
              placeholder="My Database"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") onClose(); }}
            />
          </div>
          {!isEdit && (
          <div>
            <label className="block text-xs font-medium text-text-muted mb-1.5">Template</label>
            <div className="grid grid-cols-1 gap-1.5">
              {TEMPLATES.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedTemplate === t.id
                        ? "border-accent bg-accent-light"
                        : "border-border hover:border-accent/40 bg-surface"
                    }`}
                    onClick={() => setSelectedTemplate(t.id)}
                  >
                    <Icon className="w-4 h-4 text-accent flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-text-primary">{t.label}</div>
                      <div className="text-[10px] text-text-muted truncate">{t.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <button className="px-3 py-1.5 text-xs rounded-md border border-border text-text-muted hover:bg-muted" onClick={onClose}>
            Cancel
          </button>
          <button
            className="px-3 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent-hover disabled:opacity-40"
            disabled={!title.trim()}
            onClick={handleCreate}
          >
            {isEdit ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
