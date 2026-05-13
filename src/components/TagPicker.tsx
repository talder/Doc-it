"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Hash, X } from "lucide-react";

interface TagPickerProps {
  /** Currently selected tags. */
  value: string[];
  /** Called when the tag list changes. */
  onChange: (tags: string[]) => void;
  /** Optional label above the picker. */
  label?: string;
  /** Hint text below the picker. */
  hint?: string;
  /** Additional className on the wrapper. */
  className?: string;
}

/**
 * Multi-select tag picker that loads available tags from the global `/api/tags`
 * endpoint (aggregated across all documentation spaces). Users can select
 * existing tags from a searchable dropdown or type a new tag name.
 */
export default function TagPicker({ value, onChange, label, hint, className }: TagPickerProps) {
  const [allTags, setAllTags] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch global tags once
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.tags) setAllTags(d.tags); })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedSet = new Set(value);
  const searchLower = search.toLowerCase().trim();

  // Filter: unselected tags matching search
  const filtered = allTags.filter(
    (t) => !selectedSet.has(t) && (!searchLower || t.toLowerCase().includes(searchLower))
  );

  // Allow creating a new tag if the search term doesn't match any existing tag
  const canCreate = searchLower && !allTags.some((t) => t.toLowerCase() === searchLower) && !selectedSet.has(searchLower);

  const addTag = (tag: string) => {
    const normalized = tag.toLowerCase().trim();
    if (normalized && !value.includes(normalized)) {
      onChange([...value, normalized]);
    }
    setSearch("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (filtered.length > 0) {
        addTag(filtered[0]);
      } else if (canCreate) {
        addTag(searchLower);
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
    if (e.key === "Backspace" && !search && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  return (
    <div className={className} ref={wrapperRef}>
      {label && <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>}

      {/* Selected chips + input */}
      <div
        className="flex flex-wrap gap-1 min-h-[34px] px-2 py-1 border border-border rounded-lg bg-surface cursor-text focus-within:border-accent transition-colors"
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
            <Hash className="w-2.5 h-2.5" />
            {t}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeTag(t); }}
              className="hover:text-red-600"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? "Select or type tags…" : ""}
          className="flex-1 min-w-[80px] text-sm bg-transparent text-text-primary outline-none placeholder:text-text-muted py-0.5"
        />
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="self-center text-text-muted hover:text-text-secondary ml-auto flex-shrink-0"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* Dropdown */}
      {open && (filtered.length > 0 || canCreate) && (
        <div className="relative z-30">
          <div className="absolute top-1 left-0 right-0 max-h-48 overflow-auto border border-border rounded-lg bg-surface shadow-lg">
            {filtered.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => addTag(tag)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:bg-muted hover:text-text-primary text-left"
              >
                <Hash className="w-3 h-3 text-text-muted flex-shrink-0" />
                {tag}
              </button>
            ))}
            {canCreate && (
              <button
                type="button"
                onClick={() => addTag(searchLower)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-accent hover:bg-accent/10 text-left border-t border-border"
              >
                <Hash className="w-3 h-3 flex-shrink-0" />
                Create &quot;{searchLower}&quot;
              </button>
            )}
          </div>
        </div>
      )}

      {hint && <p className="text-[10px] text-text-muted mt-0.5">{hint}</p>}
    </div>
  );
}
