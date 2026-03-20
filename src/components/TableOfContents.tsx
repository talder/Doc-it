"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { X } from "lucide-react";

// ── Resize constants ───────────────────────────────────────────────────────────

const MIN_WIDTH = 160;
const MAX_WIDTH = 400;
const DEFAULT_WIDTH = 208; // Tailwind w-52
const STORAGE_KEY = "doc-it-toc-width";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TocHeading {
  level: 1 | 2 | 3 | 4;
  text: string;
  index: number;
}

// ── Markdown parsing ───────────────────────────────────────────────────────────

/** Strip common inline markdown formatting to get plain display text. */
function cleanText(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")         // bold
    .replace(/\*([^*]+)\*/g, "$1")              // italic
    .replace(/__([^_]+)__/g, "$1")              // bold alt
    .replace(/_([^_]+)_/g, "$1")                // italic alt
    .replace(/`([^`]+)`/g, "$1")                // inline code
    .replace(/~~([^~]+)~~/g, "$1")              // strikethrough
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")   // links
    .trim();
}

function parseToc(markdown: string): TocHeading[] {
  const headings: TocHeading[] = [];
  let index = 0;
  let inCodeBlock = false;

  for (const line of markdown.split("\n")) {
    // Track fenced code blocks so we don't pick up headings inside them
    if (line.trimStart().startsWith("```") || line.trimStart().startsWith("~~~")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const m = line.match(/^(#{1,4})\s+(.+)$/);
    if (m) {
      headings.push({
        level: m[1].length as 1 | 2 | 3 | 4,
        text: cleanText(m[2]),
        index: index++,
      });
    }
  }

  return headings;
}

// ── Styling maps ───────────────────────────────────────────────────────────────

const INDENT: Record<1 | 2 | 3 | 4, string> = {
  1: "pl-2",
  2: "pl-5",
  3: "pl-8",
  4: "pl-11",
};

const LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: "text-xs font-semibold text-text-primary",
  2: "text-xs font-medium text-text-secondary",
  3: "text-xs text-text-muted",
  4: "text-[11px] text-text-muted",
};

// ── Scroll helper ──────────────────────────────────────────────────────────────

function scrollToHeading(heading: TocHeading) {
  const tag = `h${heading.level}`;
  const candidates = document.querySelectorAll<HTMLElement>(`.ProseMirror ${tag}`);
  const el = Array.from(candidates).find(
    (node) => node.textContent?.trim() === heading.text
  );
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

interface Backlink {
  name: string;
  category: string;
}

interface Props {
  markdown: string;
  onClose: () => void;
  backlinks?: Backlink[];
  onBacklinkClick?: (bl: Backlink) => void;
}

export default function TableOfContents({ markdown, onClose, backlinks = [], onBacklinkClick }: Props) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);
  const headings = parseToc(markdown);

  // Load persisted width
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parseInt(saved, 10))));
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    setDragging(true);
  }, [width]);

  useEffect(() => {
    if (!dragging) return;
    const onMouseMove = (e: MouseEvent) => {
      // Handle is on the LEFT edge: drag left = wider, drag right = narrower
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current - (e.clientX - startX.current)));
      setWidth(newWidth);
    };
    const onMouseUp = () => {
      setDragging(false);
      localStorage.setItem(STORAGE_KEY, String(width));
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, width]);

  const handleClick = (h: TocHeading) => {
    setActiveIdx(h.index);
    scrollToHeading(h);
  };

  return (
    <div className="shrink-0 border-l border-border bg-surface flex flex-col overflow-hidden relative" style={{ width }}>
      {/* Resize handle — left edge */}
      <div
        className={`toc-resize-handle${dragging ? " active" : ""}`}
        onMouseDown={onMouseDown}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border flex-shrink-0">
        <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">
          On this page
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded text-text-muted hover:text-text-secondary hover:bg-muted transition-colors"
          title="Close table of contents"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Heading list */}
      <div className="flex-1 overflow-y-auto flex flex-col">
        {headings.length === 0 ? (
          <p className="px-3 py-4 text-xs text-text-muted italic">No headings found</p>
        ) : (
          <nav className="py-2 px-1">
            {headings.map((h) => (
              <button
                key={h.index}
                onClick={() => handleClick(h)}
                title={h.text}
                className={`
                  w-full text-left rounded py-1 pr-2 transition-colors
                  hover:bg-muted/60 active:bg-muted
                  ${INDENT[h.level]}
                  ${LABEL[h.level]}
                  ${activeIdx === h.index ? "bg-accent-light !text-accent-text" : ""}
                `}
              >
                <span className="truncate block leading-snug">{h.text}</span>
              </button>
            ))}
          </nav>
        )}

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="mt-auto border-t border-border pt-2 pb-3 px-1">
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Linked from
            </p>
            {backlinks.map((bl) => (
              <button
                key={`${bl.category}/${bl.name}`}
                onClick={() => onBacklinkClick?.(bl)}
                title={bl.name}
                className="w-full text-left rounded py-1 pl-2 pr-2 text-xs text-accent hover:bg-muted/60 transition-colors flex items-center gap-1.5 truncate"
              >
                <svg className="shrink-0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span className="truncate">{bl.name}</span>
                {bl.category && <span className="text-text-muted shrink-0">· {bl.category}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
