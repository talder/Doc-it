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
          // Decode from single base64 config attribute
          const configB64 = el.getAttribute("data-query-config") || "";
          if (configB64) {
            try {
              const cfg = JSON.parse(atob(configB64));
              return {
                spaceSlug: cfg.spaceSlug || "",
                dbId: cfg.dbId || "",
                columns: cfg.columns || "[]",
                filters: cfg.filters || "[]",
                sorts: cfg.sorts || "[]",
                limit: cfg.limit || 0,
              };
            } catch { /* fall through */ }
          }
          // Fallback: read individual attributes (backward compat)
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
    // Encode all config into a single base64 string to avoid HTML attribute escaping issues
    const config = {
      spaceSlug: node.attrs.spaceSlug || "",
      dbId: node.attrs.dbId || "",
      columns: node.attrs.columns || "[]",
      filters: node.attrs.filters || "[]",
      sorts: node.attrs.sorts || "[]",
      limit: node.attrs.limit || 0,
    };
    const configB64 = btoa(JSON.stringify(config));
    return [
      "div",
      mergeAttributes({
        "data-query-block": "",
        "data-query-config": configB64,
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
