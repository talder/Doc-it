"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useEffect } from "react";
import { Marked } from "marked";
import { FileText, ExternalLink, Link2, Link2Off } from "lucide-react";

// ─── Navigation handler (same module-level pattern as TagLink) ─────────────────
let linkedDocClickHandler: ((docName: string, docCategory: string, spaceSlug: string, anchor?: string) => void) | null = null;

export function setLinkedDocClickHandler(
  handler: ((docName: string, docCategory: string, spaceSlug: string, anchor?: string) => void) | null
) {
  linkedDocClickHandler = handler;
}

// Plain marked instance for embed view (no custom callout/tag extensions)
const embedMarked = new Marked();

// ─── Types ────────────────────────────────────────────────────────────────────
type ViewMode = "inline" | "card" | "embed";

export interface LinkedDocAttrs {
  docName: string;
  docCategory: string;
  viewMode: ViewMode;
  spaceSlug: string;
  anchor?: string; // optional heading text to scroll to
}

// ─── Node View ────────────────────────────────────────────────────────────────
function LinkedDocNodeView({
  node,
  updateAttributes,
}: {
  node: { attrs: LinkedDocAttrs };
  updateAttributes: (attrs: Partial<LinkedDocAttrs>) => void;
}) {
  const { docName, docCategory, viewMode, spaceSlug, anchor } = node.attrs;
  const [docContent, setDocContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!docName || !spaceSlug) return;
    setLoading(true);
    setError(null);
    fetch(
      `/api/spaces/${encodeURIComponent(spaceSlug)}/docs/${encodeURIComponent(docName)}?category=${encodeURIComponent(docCategory)}`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject("not-found")))
      .then((data) => setDocContent(data.content || ""))
      .catch(() => setError("not-found"))
      .finally(() => setLoading(false));
  }, [docName, docCategory, spaceSlug]);

  const getExcerpt = (md: string, max = 140) => {
    const lines = md.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const text = lines[0]?.replace(/[*_`[\]!]/g, "").trim() || "";
    return text.length > max ? text.slice(0, max) + "…" : text;
  };

  // Check if the anchor heading actually exists in the loaded content
  const anchorFound = !anchor || !docContent
    ? true // unknown until content loads
    : docContent.split("\n").some((line) => {
        const m = line.match(/^#{1,6}\s+(.+)$/);
        return m && m[1].trim().toLowerCase() === anchor.toLowerCase();
      });

  const handleNavigate = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    linkedDocClickHandler?.(docName, docCategory, spaceSlug, anchor);
  };

  const ViewSwitcher = () => (
    <div className="flex items-center gap-0.5 flex-shrink-0" contentEditable={false}>
      {(["inline", "card", "embed"] as ViewMode[]).map((mode) => (
        <button
          key={mode}
          className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
            viewMode === mode
              ? "bg-accent text-white"
              : "bg-muted text-text-muted hover:bg-border"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            updateAttributes({ viewMode: mode });
          }}
        >
          {mode.charAt(0).toUpperCase() + mode.slice(1)}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <NodeViewWrapper className="my-2">
        <div className="p-3 rounded-lg border border-border bg-muted/30 text-text-muted text-sm animate-pulse">
          Loading…
        </div>
      </NodeViewWrapper>
    );
  }

  if (error) {
    return (
      <NodeViewWrapper className="my-2">
        <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-border bg-muted/20">
          <FileText className="w-4 h-4 text-text-muted flex-shrink-0" />
          <span className="text-sm text-text-muted italic flex-1">{docName} — not found</span>
          <ViewSwitcher />
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Inline view ──────────────────────────────────────────────────────────────
  if (viewMode === "inline") {
    return (
      <NodeViewWrapper className="my-1 flex items-center gap-2 flex-wrap" contentEditable={false}>
        <button
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent-light text-accent-text border border-accent/30 text-sm font-medium hover:bg-accent hover:text-white transition-colors"
          onMouseDown={handleNavigate}
        >
          <FileText className="w-3.5 h-3.5" />
          {docName}
          {anchor && (
            <span className="inline-flex items-center gap-0.5">
              {anchorFound ? (
                <Link2 className="w-3 h-3 text-red-500" />
              ) : (
                <Link2Off className="w-3 h-3 text-red-400 opacity-70" title="Section not found" />
              )}
              <span className="text-[10px] font-normal opacity-80">§ {anchor}</span>
            </span>
          )}
          <ExternalLink className="w-3 h-3 opacity-60" />
        </button>
        <ViewSwitcher />
      </NodeViewWrapper>
    );
  }

  // ── Card view ────────────────────────────────────────────────────────────────
  if (viewMode === "card") {
    const excerpt = getExcerpt(docContent || "");
    return (
      <NodeViewWrapper className="my-2" contentEditable={false}>
        <div className="rounded-lg border border-border bg-surface hover:border-accent/50 transition-colors max-w-lg">
          <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
            <button
              className="flex items-center gap-2 flex-1 min-w-0 text-left"
              onMouseDown={handleNavigate}
            >
              <FileText className="w-4 h-4 text-accent flex-shrink-0" />
              <span className="font-semibold text-sm text-text-primary truncate">{docName}</span>
              {docCategory && (
                <span className="text-xs text-text-muted bg-muted px-1.5 py-0.5 rounded flex-shrink-0">
                  {docCategory}
                </span>
              )}
              {anchor && (
                <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                  {anchorFound ? (
                    <Link2 className="w-3 h-3 text-red-500" />
                  ) : (
                    <Link2Off className="w-3 h-3 text-red-400 opacity-70" title="Section not found" />
                  )}
                  <span className="text-[10px] text-red-500 font-medium">§ {anchor}</span>
                </span>
              )}
            </button>
            <ViewSwitcher />
          </div>
          {excerpt && (
            <p className="px-3 pb-2.5 text-xs text-text-muted leading-relaxed">{excerpt}</p>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  // ── Embed view ───────────────────────────────────────────────────────────────
  const embedHtml =
    docContent != null
      ? (embedMarked.parse(docContent, { async: false }) as string)
      : "";

  return (
    <NodeViewWrapper className="my-2" contentEditable={false}>
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
          <button
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
            onMouseDown={handleNavigate}
          >
            <FileText className="w-4 h-4 text-accent flex-shrink-0" />
            <span className="font-semibold text-sm text-text-primary truncate">{docName}</span>
          </button>
          <ViewSwitcher />
        </div>
        <div
          className="px-4 py-3 prose prose-sm max-w-none text-text-primary text-sm max-h-96 overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: embedHtml }}
        />
      </div>
    </NodeViewWrapper>
  );
}

// ─── TipTap Extension ─────────────────────────────────────────────────────────
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    linkedDoc: {
      insertLinkedDoc: (attrs: LinkedDocAttrs) => ReturnType;
    };
  }
}

export const LinkedDocExtension = Node.create({
  name: "linkedDoc",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      docName:     { default: "" },
      docCategory: { default: "" },
      viewMode:    { default: "card" },
      spaceSlug:   { default: "" },
      anchor:      { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-linked-doc]",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return {
            docName:     el.getAttribute("data-doc-name")     || "",
            docCategory: el.getAttribute("data-doc-category") || "",
            viewMode:    el.getAttribute("data-view-mode")    || "card",
            spaceSlug:   el.getAttribute("data-space-slug")   || "",
            anchor:      el.getAttribute("data-anchor")       || "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({
        "data-linked-doc":   "",
        "data-doc-name":     node.attrs.docName || "",
        "data-doc-category": node.attrs.docCategory || "",
        "data-view-mode":    node.attrs.viewMode || "card",
        "data-space-slug":   node.attrs.spaceSlug || "",
        "data-anchor":       node.attrs.anchor || "",
      }),
      "[Linked Doc]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkedDocNodeView as any);
  },

  addCommands() {
    return {
      insertLinkedDoc: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});
