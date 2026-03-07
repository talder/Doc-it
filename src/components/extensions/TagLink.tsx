"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";

// Module-level click handler, set from Editor component
let onTagClickHandler: ((tag: string) => void) | null = null;

export function setTagClickHandler(handler: ((tag: string) => void) | null) {
  onTagClickHandler = handler;
}

function TagLinkView({ node }: any) {
  return (
    <NodeViewWrapper
      as="span"
      className="tag-link"
      data-tag={node.attrs.tag}
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
