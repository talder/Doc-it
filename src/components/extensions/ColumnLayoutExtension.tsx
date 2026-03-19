"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { FC, useRef, useState, useCallback, useEffect } from "react";
import { Trash2, Columns2, Columns3 } from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultWidths(cols: number): string {
  if (cols === 3) return "33,34,33";
  return "50,50";
}

function parseWidths(raw: string): number[] {
  return raw.split(",").map((s) => parseFloat(s.trim()) || 0);
}

// ── ColumnBlock node (individual column) ─────────────────────────────────────

export const ColumnBlock = Node.create({
  name: "columnBlock",
  // Not in "block" group – only valid inside columnLayout
  group: "",
  content: "block+",
  defining: true,
  isolating: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columnBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "columnBlock",
        class: "column-block",
      }),
      0,
    ];
  },
});

// ── ColumnLayout NodeView (React) ────────────────────────────────────────────

const ColumnLayoutNodeView: FC<any> = ({ node, updateAttributes, deleteNode, editor }) => {
  const columns: number = node.attrs.columns || 2;
  const widths = parseWidths(node.attrs.widths || defaultWidths(columns));
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragStartXRef = useRef(0);
  const dragStartWidthsRef = useRef<number[]>([]);
  const [showToolbar, setShowToolbar] = useState(false);

  // Clamp widths so no column goes below 15%
  const clampWidths = (w: number[]): number[] => {
    const min = 15;
    const total = w.reduce((a, b) => a + b, 0);
    return w.map((v) => Math.max(min, Math.min(total - min * (w.length - 1), v)));
  };

  const onMouseDown = useCallback(
    (e: React.MouseEvent, handleIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingIndex(handleIndex);
      dragStartXRef.current = e.clientX;
      dragStartWidthsRef.current = [...widths];
    },
    [widths],
  );

  useEffect(() => {
    if (draggingIndex === null) return;
    const containerWidth = containerRef.current?.offsetWidth || 800;

    const onMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartXRef.current;
      const pctDelta = (dx / containerWidth) * 100;
      const newWidths = [...dragStartWidthsRef.current];
      newWidths[draggingIndex] += pctDelta;
      newWidths[draggingIndex + 1] -= pctDelta;
      const clamped = clampWidths(newWidths);
      // Normalize to sum to 100
      const sum = clamped.reduce((a, b) => a + b, 0);
      const normalized = clamped.map((v) => Math.round((v / sum) * 100));
      // Fix rounding – ensure they sum to exactly 100
      const diff = 100 - normalized.reduce((a, b) => a + b, 0);
      if (diff !== 0) normalized[normalized.length - 1] += diff;
      updateAttributes({ widths: normalized.join(",") });
    };

    const onMouseUp = () => {
      setDraggingIndex(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [draggingIndex, updateAttributes]);

  const toggleColumns = () => {
    if (columns === 2) {
      updateAttributes({ columns: 3, widths: "33,34,33" });
    } else {
      updateAttributes({ columns: 2, widths: "50,50" });
    }
  };

  return (
    <NodeViewWrapper
      className="column-layout"
      data-type="columnLayout"
      data-columns={columns}
      style={{
        '--col-w1': String(widths[0] || 50),
        '--col-w2': String(widths[1] || 50),
        ...(columns === 3 ? { '--col-w3': String(widths[2] || 33) } : {}),
      } as React.CSSProperties}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      {/* Toolbar */}
      {editor.isEditable && showToolbar && (
        <div className="column-layout-toolbar" contentEditable={false}>
          <button
            className="column-toolbar-btn"
            title={columns === 2 ? "Switch to 3 columns" : "Switch to 2 columns"}
            onClick={toggleColumns}
          >
            {columns === 2 ? <Columns3 className="w-3.5 h-3.5" /> : <Columns2 className="w-3.5 h-3.5" />}
          </button>
          <button
            className="column-toolbar-btn column-toolbar-btn-danger"
            title="Remove column layout"
            onClick={deleteNode}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="column-layout-inner" ref={containerRef}>
        <NodeViewContent className="column-layout-content" />
        {/* Resize handles – rendered between columns via CSS positioning */}
        {editor.isEditable &&
          Array.from({ length: columns - 1 }).map((_, i) => {
            // Position handle at the cumulative width of columns 0..i
            const leftPct = widths.slice(0, i + 1).reduce((a, b) => a + b, 0);
            return (
              <div
                key={i}
                className={`column-resize-handle${draggingIndex === i ? " active" : ""}`}
                contentEditable={false}
                style={{ left: `${leftPct}%` }}
                onMouseDown={(e) => onMouseDown(e, i)}
              />
            );
          })}
      </div>
    </NodeViewWrapper>
  );
};

// ── ColumnLayout node (wrapper) ──────────────────────────────────────────────

export const ColumnLayout = Node.create({
  name: "columnLayout",
  group: "block",
  content: "columnBlock{2,3}",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      columns: {
        default: 2,
        parseHTML: (element) => parseInt(element.getAttribute("data-columns") || "2", 10),
        renderHTML: (attributes) => ({ "data-columns": attributes.columns }),
      },
      widths: {
        default: "50,50",
        parseHTML: (element) => element.getAttribute("data-widths") || "50,50",
        renderHTML: (attributes) => ({ "data-widths": attributes.widths }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="columnLayout"]',
        getAttrs: (dom) => {
          const el = dom as HTMLElement;
          return {
            columns: parseInt(el.getAttribute("data-columns") || "2", 10),
            widths: el.getAttribute("data-widths") || "50,50",
          };
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "columnLayout",
        "data-columns": node.attrs.columns,
        "data-widths": node.attrs.widths,
        class: "column-layout",
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnLayoutNodeView);
  },

  addCommands() {
    return {
      insertColumnLayout:
        (cols: number = 2) =>
        ({ editor, commands }: any) => {
          // Prevent nesting: don't insert if cursor is already inside a columnLayout
          const { $from } = editor.state.selection;
          for (let d = $from.depth; d > 0; d--) {
            if ($from.node(d).type.name === "columnLayout") return false;
          }

          const columnBlocks = Array.from({ length: cols }).map(() => ({
            type: "columnBlock",
            content: [{ type: "paragraph" }],
          }));

          return commands.insertContent({
            type: this.name,
            attrs: { columns: cols, widths: defaultWidths(cols) },
            content: columnBlocks,
          });
        },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      // When pressing Enter on an empty paragraph at the end of a column,
      // break out of the column layout entirely
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty) return false;

        // Check if we're inside a columnBlock
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === "columnBlock") {
            const parent = $from.parent;
            const isEmptyParagraph =
              parent.type.name === "paragraph" && parent.content.size === 0;
            const isLastChild = $from.index(depth) === node.childCount - 1;
            if (isEmptyParagraph && isLastChild) {
              // Find the columnLayout depth (one above columnBlock)
              const layoutDepth = depth - 1;
              if ($from.node(layoutDepth)?.type.name === "columnLayout") {
                const pos = $from.after(layoutDepth);
                return editor
                  .chain()
                  .deleteNode("paragraph")
                  .insertContentAt(pos, { type: "paragraph" })
                  .focus()
                  .run();
              }
            }
            break;
          }
        }
        return false;
      },
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty) return false;
        if ($from.parentOffset !== 0) return false;

        // If at start of first block in a columnBlock, don't break the layout
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === "columnBlock") {
            const indexInCol = $from.index(depth);
            if (indexInCol === 0) {
              // At start of first block in column – do nothing special
              return true;
            }
            break;
          }
        }
        return false;
      },
    };
  },
});
