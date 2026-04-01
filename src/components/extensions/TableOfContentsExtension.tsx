"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { FC, useState, useEffect, useCallback } from "react";
import { ListTree, Trash2 } from "lucide-react";
import { Plugin as PmPlugin, PluginKey as PmPluginKey } from "@tiptap/pm/state";

// ── Types ──────────────────────────────────────────────────────────────────────

interface TocEntry {
  level: number;
  text: string;
  pos: number;
  number: string; // e.g. "1.2.3"
}

// ── Heading scanner ────────────────────────────────────────────────────────────

/** Walk the editor doc and collect all heading nodes with hierarchical numbers. */
function collectHeadings(doc: any): TocEntry[] {
  const entries: TocEntry[] = [];
  const counters = [0, 0, 0, 0]; // h1, h2, h3, h4

  doc.descendants((node: any, pos: number) => {
    if (node.type.name === "heading") {
      const level: number = node.attrs.level;
      if (level < 1 || level > 4) return;

      const idx = level - 1;
      counters[idx]++;
      // Reset all deeper counters
      for (let i = idx + 1; i < 4; i++) counters[i] = 0;

      const number = counters.slice(0, idx + 1).join(".");

      entries.push({
        level,
        text: node.textContent || "",
        pos,
        number,
      });
    }
  });

  return entries;
}

// ── Scroll helper ──────────────────────────────────────────────────────────────

function scrollToPos(editor: any, pos: number) {
  const view = editor.view;
  const dom = view.domAtPos(pos + 1);
  const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ── Indent / label maps ────────────────────────────────────────────────────────

const INDENT: Record<number, string> = {
  1: "pl-2",
  2: "pl-5",
  3: "pl-8",
  4: "pl-11",
};

const LABEL: Record<number, string> = {
  1: "text-sm font-semibold text-text-primary",
  2: "text-sm font-medium text-text-secondary",
  3: "text-xs text-text-muted",
  4: "text-xs text-text-muted italic",
};

// ── React NodeView ─────────────────────────────────────────────────────────────

const TableOfContentsNodeView: FC<any> = ({ node, updateAttributes, deleteNode, editor }) => {
  const [headings, setHeadings] = useState<TocEntry[]>([]);
  const showNumbering: boolean = node.attrs.showNumbering ?? false;

  // Scan headings on mount and on every editor update
  const scan = useCallback(() => {
    if (!editor) return;
    setHeadings(collectHeadings(editor.state.doc));
  }, [editor]);

  useEffect(() => {
    scan();
    editor.on("update", scan);
    return () => {
      editor.off("update", scan);
    };
  }, [editor, scan]);

  // When showNumbering changes, dispatch event for sidebar TOC + set attribute
  useEffect(() => {
    document.dispatchEvent(
      new CustomEvent("toc:numbering", { detail: { enabled: showNumbering }, bubbles: true }),
    );
  }, [showNumbering]);

  return (
    <NodeViewWrapper
      className="toc-block my-4"
      data-type="tableOfContents"
      contentEditable={false}
    >
      <div className="toc-block-inner">
        {/* Header row */}
        <div className="toc-block-header">
          <div className="toc-block-title">
            <ListTree className="w-4 h-4" />
            <span>Table of Contents</span>
          </div>
          <div className="toc-block-actions">
            <label className="toc-numbering-toggle" title="Number headings">
              <input
                type="checkbox"
                checked={showNumbering}
                onChange={(e) => updateAttributes({ showNumbering: e.target.checked })}
              />
              <span className="toc-numbering-label">Number headings</span>
            </label>
            <button
              className="toc-delete-btn"
              onClick={deleteNode}
              title="Remove table of contents"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Heading entries */}
        {headings.length === 0 ? (
          <p className="toc-empty">No headings found. Add headings to populate the table of contents.</p>
        ) : (
          <nav className="toc-nav">
            {headings.map((h, i) => (
              <button
                key={`${h.pos}-${i}`}
                onClick={() => scrollToPos(editor, h.pos)}
                className={`toc-entry ${INDENT[h.level]} ${LABEL[h.level]}`}
                title={h.text}
              >
                {showNumbering && (
                  <span className="toc-entry-number">{h.number}</span>
                )}
                <span className="truncate">{h.text || "Untitled"}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// ── ProseMirror plugin: set data-numbered-headings on the root ─────────────

const numberedHeadingsPluginKey = new PmPluginKey("numberedHeadings");

function createNumberedHeadingsPlugin() {
  return new PmPlugin({
    key: numberedHeadingsPluginKey,
    view(editorView) {
      const update = () => {
        let enabled = false;
        editorView.state.doc.descendants((node) => {
          if (node.type.name === "tableOfContents" && node.attrs.showNumbering) {
            enabled = true;
          }
        });
        const root = editorView.dom;
        if (enabled) {
          root.setAttribute("data-numbered-headings", "true");
        } else {
          root.removeAttribute("data-numbered-headings");
        }
      };
      update();
      return { update };
    },
  });
}

// ── Extension ──────────────────────────────────────────────────────────────────

export const TableOfContentsExtension = Node.create({
  name: "tableOfContents",
  group: "block",
  atom: true, // non-editable, self-contained

  addAttributes() {
    return {
      showNumbering: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-show-numbering") === "true",
        renderHTML: (attributes) => ({
          "data-show-numbering": String(!!attributes.showNumbering),
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="tableOfContents"]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return {
            showNumbering: element.getAttribute("data-show-numbering") === "true",
          };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "tableOfContents",
      }),
      "Table of Contents",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsNodeView);
  },

  addCommands() {
    return {
      insertTableOfContents:
        () =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: { showNumbering: false },
          });
        },
    } as any;
  },

  addProseMirrorPlugins() {
    return [createNumberedHeadingsPlugin()];
  },
});
