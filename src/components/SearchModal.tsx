"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, FileText, Hash, Filter, X, Clock, Tag, User, FolderOpen, Shield, Calendar, ClipboardList, Monitor, Headset } from "lucide-react";
import type { DocFile, TagsIndex, Category } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

interface ContentResult {
  name: string;
  category: string;
  matchType: "name" | "content" | "tag" | "both";
  snippet?: string;
  author?: string;
  updatedAt?: string;
  classification?: string;
  tags?: string[];
}

interface SearchFilters {
  category: string;
  tag: string;
  author: string;
  classification: string;
  from: string;
  to: string;
}

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  docs: DocFile[];
  tagsIndex: TagsIndex;
  categories: Category[];
  spaceSlug: string | null;
  spaceMembers: { username: string; fullName?: string }[];
  onOpenDoc: (name: string, category: string) => void;
  initialQuery?: string;
}

const RECENT_KEY = "doc-it-recent-searches";
const MAX_RECENT = 8;

function loadRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, MAX_RECENT);
  } catch { return []; }
}

function saveRecent(query: string) {
  const prev = loadRecent().filter((q) => q !== query);
  const next = [query, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const EMPTY_FILTERS: SearchFilters = { category: "", tag: "", author: "", classification: "", from: "", to: "" };

// ── Component ────────────────────────────────────────────────────────────────

export default function SearchModal({
  isOpen, onClose, docs, tagsIndex, categories, spaceSlug, spaceMembers, onOpenDoc, initialQuery,
}: SearchModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Client-side instant results (name + tag matches)
  const [instantResults, setInstantResults] = useState<{ name: string; category: string; matchType: "name" | "tag" }[]>([]);
  // Server-side content results
  const [contentResults, setContentResults] = useState<ContentResult[]>([]);
  // Changelog results
  const [changeResults, setChangeResults] = useState<{ id: string; date: string; system: string; category: string; description: string; risk: string }[]>([]);
  // Asset results
  const [assetResults, setAssetResults] = useState<{ id: string; name: string; type: string; status: string; location: string }[]>([]);
  // Ticket results
  const [ticketResults, setTicketResults] = useState<{ id: string; subject: string; status: string; priority: string; requester: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Load recent searches on open
  useEffect(() => {
    if (isOpen) {
      setRecentSearches(loadRecent());
      setQuery(initialQuery || "");
      setInstantResults([]);
      setContentResults([]);
      setChangeResults([]);
      setAssetResults([]);
      setTicketResults([]);
      setSelectedIdx(0);
      setShowFilters(false);
      setFilters(EMPTY_FILTERS);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, initialQuery]);

  // Client-side instant search (name + tag)
  useEffect(() => {
    if (!query || query.length < 2) {
      setInstantResults([]);
      return;
    }
    const q = query.toLowerCase();

    // Name matches
    const nameMatches: { name: string; category: string; matchType: "name" | "tag" }[] = docs
      .filter((d) => d.name.toLowerCase().includes(q) && !d.isTemplate)
      .slice(0, 8)
      .map((d) => ({ name: d.name, category: d.category, matchType: "name" as const }));

    // Tag matches → docs with matching tag
    const matchingTags = Object.keys(tagsIndex).filter((t) => t.includes(q));
    const tagDocSet = new Set(nameMatches.map((m) => `${m.category}/${m.name}`));
    const tagMatches: typeof nameMatches = [];
    for (const tagName of matchingTags) {
      const tag = tagsIndex[tagName];
      if (!tag) continue;
      const docNames = tag.docNames || [];
      for (const tn of docNames) {
        const doc = docs.find((d) => d.name === tn || `${d.category}/${d.name}` === tn);
        if (doc && !tagDocSet.has(`${doc.category}/${doc.name}`)) {
          tagDocSet.add(`${doc.category}/${doc.name}`);
          tagMatches.push({ name: doc.name, category: doc.category, matchType: "tag" as const });
        }
      }
      if (tagMatches.length >= 5) break;
    }

    setInstantResults([...nameMatches, ...tagMatches.slice(0, 5)]);
  }, [query, docs, tagsIndex]);

  // Server-side debounced content search
  const fetchContentResults = useCallback((q: string, f: SearchFilters) => {
    if (abortRef.current) abortRef.current.abort();
    if (!spaceSlug || q.length < 2) {
      setContentResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const params = new URLSearchParams({ q });
    if (f.category) params.set("category", f.category);
    if (f.tag) params.set("tag", f.tag);
    if (f.author) params.set("author", f.author);
    if (f.classification) params.set("classification", f.classification);
    if (f.from) params.set("from", f.from);
    if (f.to) params.set("to", f.to);

    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/search?${params}`, { signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : { results: [] })
      .then((data) => {
        if (!ctrl.signal.aborted) {
          // Filter out results already in instant list
          const instantKeys = new Set(instantResults.map((r) => `${r.category}/${r.name}`));
          setContentResults((data.results || []).filter((r: ContentResult) => !instantKeys.has(`${r.category}/${r.name}`)));
          setSearching(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSearching(false);
      });
  }, [spaceSlug, instantResults]);

  // Fetch changelog results
  const fetchChangeResults = useCallback((q: string) => {
    if (q.length < 2) { setChangeResults([]); return; }
    fetch(`/api/changelog?q=${encodeURIComponent(q)}`)
      .then((r) => r.ok ? r.json() : { entries: [] })
      .then((data) => setChangeResults((data.entries || []).slice(0, 5)))
      .catch(() => setChangeResults([]));
  }, []);

  // Fetch asset results
  const fetchAssetResults = useCallback((q: string) => {
    if (q.length < 2) { setAssetResults([]); return; }
    fetch(`/api/assets?q=${encodeURIComponent(q)}`)
      .then((r) => r.ok ? r.json() : { assets: [] })
      .then((data) => setAssetResults((data.assets || []).slice(0, 5)))
      .catch(() => setAssetResults([]));
  }, []);

  // Fetch ticket results
  const fetchTicketResults = useCallback((q: string) => {
    if (q.length < 2) { setTicketResults([]); return; }
    fetch(`/api/helpdesk?q=${encodeURIComponent(q)}`)
      .then((r) => r.ok ? r.json() : { tickets: [] })
      .then((data) => setTicketResults((data.tickets || []).slice(0, 5).map((t: { id: string; subject: string; status: string; priority: string; requester: string }) => ({ id: t.id, subject: t.subject, status: t.status, priority: t.priority, requester: t.requester }))))
      .catch(() => setTicketResults([]));
  }, []);

  // Debounce server search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query || query.length < 2) {
      setContentResults([]);
      setChangeResults([]);
      setAssetResults([]);
      setTicketResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      fetchContentResults(query, filters);
      fetchChangeResults(query);
      fetchAssetResults(query);
      fetchTicketResults(query);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, filters, fetchContentResults, fetchChangeResults, fetchAssetResults, fetchTicketResults]);

  // Combined results for keyboard nav
  const allResults = [
    ...instantResults.map((r) => ({ ...r, section: "instant" as const })),
    ...contentResults.map((r) => ({ ...r, section: "content" as const })),
  ];

  // Reset selection when results change
  useEffect(() => { setSelectedIdx(0); }, [instantResults, contentResults]);

  // Scroll selected into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const handleSelect = useCallback((name: string, category: string) => {
    if (query.trim()) saveRecent(query.trim());
    onOpenDoc(name, category);
    onClose();
  }, [query, onOpenDoc, onClose]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, allResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = allResults[selectedIdx];
      if (r) handleSelect(r.name, r.category);
    } else if (e.key === "Escape") {
      onClose();
    }
  };

  const hasActiveFilters = filters.category || filters.tag || filters.author || filters.classification || filters.from || filters.to;
  const allTags = Object.keys(tagsIndex).sort();
  const docCategories = categories.filter((c) => c.path !== "Templates" && !c.path.startsWith("Templates/"));

  if (!isOpen) return null;

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-modal" onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className="search-input-row">
          <Search className="w-5 h-5 text-text-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documents, tags, content…"
            className="search-input"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button onClick={() => { setQuery(""); inputRef.current?.focus(); }} className="search-clear-btn">
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`search-filter-toggle${showFilters || hasActiveFilters ? " active" : ""}`}
            title="Advanced filters"
          >
            <Filter className="w-4 h-4" />
          </button>
          <kbd className="search-kbd">ESC</kbd>
        </div>

        {/* Advanced filters panel */}
        {showFilters && (
          <div className="search-filters">
            <div className="search-filters-grid">
              <div className="search-filter-field">
                <label><FolderOpen className="w-3 h-3" /> Category</label>
                <select value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
                  <option value="">All categories</option>
                  {docCategories.map((c) => <option key={c.path} value={c.path}>{c.path}</option>)}
                </select>
              </div>
              <div className="search-filter-field">
                <label><Tag className="w-3 h-3" /> Tag</label>
                <select value={filters.tag} onChange={(e) => setFilters((f) => ({ ...f, tag: e.target.value }))}>
                  <option value="">All tags</option>
                  {allTags.map((t) => <option key={t} value={t}>#{t}</option>)}
                </select>
              </div>
              <div className="search-filter-field">
                <label><User className="w-3 h-3" /> Author</label>
                <select value={filters.author} onChange={(e) => setFilters((f) => ({ ...f, author: e.target.value }))}>
                  <option value="">Any author</option>
                  {spaceMembers.map((m) => <option key={m.username} value={m.username}>{m.fullName || m.username}</option>)}
                </select>
              </div>
              <div className="search-filter-field">
                <label><Shield className="w-3 h-3" /> Classification</label>
                <select value={filters.classification} onChange={(e) => setFilters((f) => ({ ...f, classification: e.target.value }))}>
                  <option value="">Any</option>
                  <option value="public">Public</option>
                  <option value="internal">Internal</option>
                  <option value="confidential">Confidential</option>
                  <option value="restricted">Restricted</option>
                </select>
              </div>
              <div className="search-filter-field">
                <label><Calendar className="w-3 h-3" /> From</label>
                <input type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
              </div>
              <div className="search-filter-field">
                <label><Calendar className="w-3 h-3" /> To</label>
                <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
              </div>
            </div>
            {hasActiveFilters && (
              <button className="search-clear-filters" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Results */}
        <div className="search-results" ref={listRef}>
          {/* No query — show recent searches */}
          {!query && recentSearches.length > 0 && (
            <div className="search-section">
              <div className="search-section-header">
                <Clock className="w-3.5 h-3.5" />
                Recent searches
              </div>
              {recentSearches.map((q) => (
                <button
                  key={q}
                  className="search-recent-item"
                  onClick={() => setQuery(q)}
                >
                  <Search className="w-3.5 h-3.5 text-text-muted" />
                  <span>{q}</span>
                </button>
              ))}
            </div>
          )}

          {/* No query, no recent — hint */}
          {!query && recentSearches.length === 0 && (
            <div className="search-empty">
              <Search className="w-6 h-6 text-text-muted opacity-40" />
              <p>Type to search across all documents</p>
              <p className="text-xs text-text-muted mt-1">Use filters for advanced search · <kbd className="search-kbd-inline">⌘K</kbd> to open anytime</p>
            </div>
          )}

          {/* Instant results (name / tag matches) */}
          {instantResults.length > 0 && (
            <div className="search-section">
              <div className="search-section-header">
                <FileText className="w-3.5 h-3.5" />
                Documents
              </div>
              {instantResults.map((r, i) => (
                <button
                  key={`${r.category}/${r.name}`}
                  data-idx={i}
                  className={`search-result-item${selectedIdx === i ? " selected" : ""}`}
                  onClick={() => handleSelect(r.name, r.category)}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <FileText className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="search-result-body">
                    <span className="search-result-name">{highlightMatch(r.name, query)}</span>
                    <span className="search-result-path">{r.category}</span>
                  </div>
                  {r.matchType === "tag" && (
                    <span className="search-result-badge">tag match</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Content results (server-side) */}
          {contentResults.length > 0 && (
            <div className="search-section">
              <div className="search-section-header">
                <Hash className="w-3.5 h-3.5" />
                Content matches
              </div>
              {contentResults.map((r, i) => {
                const idx = instantResults.length + i;
                return (
                  <button
                    key={`${r.category}/${r.name}`}
                    data-idx={idx}
                    className={`search-result-item${selectedIdx === idx ? " selected" : ""}`}
                    onClick={() => handleSelect(r.name, r.category)}
                    onMouseEnter={() => setSelectedIdx(idx)}
                  >
                    <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
                    <div className="search-result-body">
                      <div className="flex items-center gap-2">
                        <span className="search-result-name">{r.name}</span>
                        <span className="search-result-path">{r.category}</span>
                      </div>
                      {r.snippet && (
                        <p className="search-result-snippet" dangerouslySetInnerHTML={{ __html: r.snippet }} />
                      )}
                      <div className="search-result-meta">
                        {r.author && <span>{r.author}</span>}
                        {r.updatedAt && <span>{timeAgo(r.updatedAt)}</span>}
                        {r.tags && r.tags.length > 0 && (
                          <span className="search-result-tags">
                            {r.tags.slice(0, 3).map((t) => `#${t}`).join(" ")}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Loading indicator */}
          {searching && query.length >= 2 && (
            <div className="search-loading">
              <div className="search-loading-dot" />
              Searching content…
            </div>
          )}

          {/* Changelog results */}
          {changeResults.length > 0 && (
            <div className="search-section">
              <div className="search-section-header">
                <ClipboardList className="w-3.5 h-3.5" />
                Changes
              </div>
              {changeResults.map((c) => (
                <a
                  key={c.id}
                  href={`/changelog`}
                  className="search-result-item"
                  onClick={() => onClose()}
                >
                  <ClipboardList className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className="search-result-body">
                    <div className="flex items-center gap-2">
                      <span className="search-result-name">{c.id}</span>
                      <span className="search-result-path">{c.system}</span>
                    </div>
                    <p className="search-result-snippet">{c.description.slice(0, 100)}</p>
                    <div className="search-result-meta">
                      <span>{c.date}</span>
                      <span>{c.category}</span>
                      <span className={`cl-badge cl-risk--${c.risk.toLowerCase()}`}>{c.risk}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Asset results */}
          {assetResults.length > 0 && (
            <div className="search-section">
              <div className="search-section-header">
                <Monitor className="w-3.5 h-3.5" />
                Assets
              </div>
              {assetResults.map((a) => (
                <a
                  key={a.id}
                  href="/assets"
                  className="search-result-item"
                  onClick={() => onClose()}
                >
                  <Monitor className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className="search-result-body">
                    <div className="flex items-center gap-2">
                      <span className="search-result-name">{a.name}</span>
                      <span className="search-result-path">{a.id}</span>
                    </div>
                    <div className="search-result-meta">
                      <span>{a.type}</span>
                      <span className={`cl-badge am-status--${a.status.toLowerCase()}`}>{a.status}</span>
                      {a.location && <span>{a.location}</span>}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* Ticket results */}
          {ticketResults.length > 0 && (
            <div className="search-section">
              <div className="search-section-header">
                <Headset className="w-3.5 h-3.5" />
                Tickets
              </div>
              {ticketResults.map((t) => (
                <a
                  key={t.id}
                  href="/helpdesk"
                  className="search-result-item"
                  onClick={() => onClose()}
                >
                  <Headset className="w-4 h-4 text-text-muted flex-shrink-0" />
                  <div className="search-result-body">
                    <div className="flex items-center gap-2">
                      <span className="search-result-name">{t.id}</span>
                      <span className={`cl-badge hd-status--${t.status.toLowerCase().replace(/\s+/g, "-")}`}>{t.status}</span>
                      <span className={`cl-badge hd-priority--${t.priority.toLowerCase()}`}>{t.priority}</span>
                    </div>
                    <p className="search-result-snippet">{t.subject}</p>
                    <div className="search-result-meta">
                      <span>by {t.requester}</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}

          {/* No results */}
          {query.length >= 2 && !searching && instantResults.length === 0 && contentResults.length === 0 && changeResults.length === 0 && assetResults.length === 0 && ticketResults.length === 0 && (
            <div className="search-empty">
              <p className="text-sm text-text-muted">No results for &ldquo;{query}&rdquo;</p>
              {hasActiveFilters && <p className="text-xs text-text-muted mt-1">Try clearing some filters</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="search-footer">
          <span><kbd className="search-kbd-inline">↑↓</kbd> Navigate</span>
          <span><kbd className="search-kbd-inline">↵</kbd> Open</span>
          <span><kbd className="search-kbd-inline">ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query || query.length < 2) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}
