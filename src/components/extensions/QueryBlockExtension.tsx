"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { QueryBlockNodeView } from "../enhanced-table/QueryBlockNodeView";

export interface QueryBlockAttrs {
  spaceSlug: string;
  dbId: string;
  columns: string;    // JSON-encoded string[] of column IDs (empty string = all)
  filters: string;    // JSON-encoded DbFilter[]
  sorts: string;      // JSON-encoded DbSort[]
  limit: number;      // 0 = no limit
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
      spaceSlug: { default: "" },
      dbId: { default: "" },
      columns: { default: "[]" },
      filters: { default: "[]" },
      sorts: { default: "[]" },
      limit: { default: 0 },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-query-block]",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return {
            spaceSlug: el.getAttribute("data-space-slug") || "",
            dbId: el.getAttribute("data-db-id") || "",
            columns: el.getAttribute("data-columns") || "[]",
            filters: el.getAttribute("data-filters") || "[]",
            sorts: el.getAttribute("data-sorts") || "[]",
            limit: parseInt(el.getAttribute("data-limit") || "0", 10) || 0,
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
        "data-space-slug": node.attrs.spaceSlug || "",
        "data-db-id": node.attrs.dbId || "",
        "data-columns": node.attrs.columns || "[]",
        "data-filters": node.attrs.filters || "[]",
        "data-sorts": node.attrs.sorts || "[]",
        "data-limit": String(node.attrs.limit || 0),
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
