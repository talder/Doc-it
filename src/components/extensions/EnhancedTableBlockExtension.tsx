"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { EnhancedTableBlockNodeView } from "../enhanced-table/EnhancedTableBlockNodeView";

export interface EnhancedTableBlockAttrs {
  dbId: string;
  viewId: string;
  spaceSlug: string;
  displayMode?: "inline" | "card" | "embed";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    databaseBlock: {
      insertDatabaseBlock: (attrs: EnhancedTableBlockAttrs) => ReturnType;
    };
  }
}

export const EnhancedTableBlockExtension = Node.create({
  name: "databaseBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      dbId: { default: "" },
      viewId: { default: "" },
      spaceSlug: { default: "" },
      displayMode: { default: "inline" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-database-block]",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return {
            dbId: el.getAttribute("data-db-id") || "",
            viewId: el.getAttribute("data-view-id") || "",
            spaceSlug: el.getAttribute("data-space-slug") || "",
            displayMode: el.getAttribute("data-display-mode") || "inline",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({
        "data-database-block": "",
        "data-db-id": node.attrs.dbId || "",
        "data-view-id": node.attrs.viewId || "",
        "data-space-slug": node.attrs.spaceSlug || "",
        "data-display-mode": node.attrs.displayMode || "inline",
      }),
      "[Enhanced Table]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(EnhancedTableBlockNodeView as any);
  },

  addCommands() {
    return {
      insertDatabaseBlock: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});
