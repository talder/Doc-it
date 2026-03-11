"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { FC, useState } from "react";
import { ChevronRight } from "lucide-react";

const CollapsibleBlockView: FC<any> = ({ node, updateAttributes, editor }) => {
  const [open, setOpen] = useState(true);
  const title: string = node.attrs.title || "Details";

  return (
    <NodeViewWrapper className="collapsible-block">
      <div className="collapsible-header" contentEditable={false}>
        <button
          className={`collapsible-toggle${open ? " open" : ""}`}
          onClick={() => setOpen((o) => !o)}
          type="button"
          aria-label={open ? "Collapse" : "Expand"}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <input
          className="collapsible-title"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
          placeholder="Details"
          readOnly={!editor.isEditable}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              editor.commands.focus();
            }
          }}
        />
      </div>
      <div className="collapsible-body" style={{ display: open ? "" : "none" }}>
        <NodeViewContent />
      </div>
    </NodeViewWrapper>
  );
};

export const CollapsibleBlock = Node.create({
  name: "collapsibleBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      title: {
        default: "Details",
        parseHTML: (element) => element.getAttribute("data-title") || "Details",
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="collapsible"]',
        getAttrs: (dom) => ({
          title: (dom as HTMLElement).getAttribute("data-title") || "Details",
        }),
        contentElement: (dom: HTMLElement) =>
          dom.querySelector(".collapsible-body") || dom,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "collapsible",
        "data-title": node.attrs.title,
        class: "collapsible-block",
      }),
      ["div", { class: "collapsible-body" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleBlockView);
  },

  addCommands() {
    return {
      insertCollapsible:
        () =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: { title: "Details" },
            content: [{ type: "paragraph" }],
          });
        },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty) return false;
        if ($from.parentOffset === 0 && $from.depth >= 2) {
          const parentNode = $from.node($from.depth - 1);
          if (parentNode?.type.name === "collapsibleBlock") {
            const index = $from.index($from.depth - 1);
            if (index === 0) return editor.commands.lift("collapsibleBlock");
          }
        }
        return false;
      },
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty) return false;
        for (let depth = $from.depth; depth > 0; depth--) {
          const n = $from.node(depth);
          if (n.type.name === "collapsibleBlock") {
            const parent = $from.parent;
            const isEmptyParagraph =
              parent.type.name === "paragraph" && parent.content.size === 0;
            const isLastChild = $from.index(depth) === n.childCount - 1;
            if (isEmptyParagraph && isLastChild) {
              const pos = $from.after(depth);
              return editor
                .chain()
                .deleteNode("paragraph")
                .insertContentAt(pos, { type: "paragraph" })
                .focus()
                .run();
            }
            break;
          }
        }
        return false;
      },
    };
  },
});
