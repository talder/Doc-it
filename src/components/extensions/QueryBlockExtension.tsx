"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { QueryBlockNodeView } from "../enhanced-table/QueryBlockNodeView";

export interface QueryBlockAttrs {
  config: string; // base64-encoded JSON of { spaceSlug, dbId, columns, filters, sorts, limit }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    queryBlock: {
      insertQueryBlock: (attrs: QueryBlockAttrs) => ReturnType;
    };
  }
}

export const QueryBlockExtension = Node.create({
  name: "queryBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      config: { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-query-block]",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return {
            config: el.getAttribute("data-query-config") || "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({
        "data-query-block": "",
        "data-query-config": node.attrs.config || "",
      }),
      "[Query Block]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(QueryBlockNodeView as any);
  },

  addCommands() {
    return {
      insertQueryBlock: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});
