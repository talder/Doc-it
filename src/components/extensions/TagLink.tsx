"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Module-level click handler, set from Editor component
let onTagClickHandler: ((tag: string) => void) | null = null;

export function setTagClickHandler(handler: ((tag: string) => void) | null) {
  onTagClickHandler = handler;
}

// Module-level tag color map, set from Editor component
let tagColorMap: Record<string, string> = {};

export function setTagColorMap(colors: Record<string, string>) {
  tagColorMap = colors;
}

function contrastText(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
}

function TagLinkView({ node }: any) {
  const color = tagColorMap[node.attrs.tag];
  return (
    <NodeViewWrapper
      as="span"
      className="tag-link"
      data-tag={node.attrs.tag}
      style={color ? { background: color, color: contrastText(color) } : undefined}
    >
      #{node.attrs.tag}
    </NodeViewWrapper>
  );
}

export const TagLink = Node.create({
  name: "tagLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      tag: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-tag]",
        getAttrs: (element) => {
          if (typeof element === "string") return false;
          const tag = element.getAttribute("data-tag");
          return tag ? { tag } : false;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-tag": node.attrs.tag }),
      `#${node.attrs.tag}`,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TagLinkView);
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tagLinkClick"),
        props: {
          handleClick(view, pos, event) {
            const { state } = view;
            const $pos = state.doc.resolve(pos);
            // Check if clicked node or the node before pos is a tagLink
            const node = state.doc.nodeAt(pos);
            if (node?.type.name === "tagLink" && onTagClickHandler) {
              event.preventDefault();
              onTagClickHandler(node.attrs.tag);
              return true;
            }
            // Also check parent for inline atoms
            if ($pos.parent) {
              const nodeAt = $pos.nodeAfter || $pos.nodeBefore;
              if (nodeAt?.type.name === "tagLink" && onTagClickHandler) {
                event.preventDefault();
                onTagClickHandler(nodeAt.attrs.tag);
                return true;
              }
            }
            return false;
          },
        },
      }),
    ];
  },
});
