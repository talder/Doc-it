"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { Download, File, FileText, Image, Archive, FileSpreadsheet, FileCode } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface AttachmentAttrs {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: string;
  spaceSlug: string;
  url: string;
}

// ─── Node View ────────────────────────────────────────────────────────────────
function AttachmentNodeView({ node }: { node: { attrs: AttachmentAttrs } }) {
  const { filename, originalName, mimeType, size, category, spaceSlug, url } = node.attrs;

  const formatSize = (bytes: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const FileIcon = () => {
    if (mimeType?.startsWith("image/")) return <Image className="w-5 h-5" />;
    if (mimeType === "application/pdf") return <FileText className="w-5 h-5 text-red-500" />;
    if (mimeType?.includes("spreadsheet") || mimeType?.includes("excel"))
      return <FileSpreadsheet className="w-5 h-5 text-green-600" />;
    if (mimeType?.includes("zip") || mimeType?.includes("compressed"))
      return <Archive className="w-5 h-5" />;
    if (mimeType?.startsWith("text/")) return <FileCode className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const downloadUrl =
    url ||
    `/api/spaces/${encodeURIComponent(spaceSlug)}/attachments/${encodeURIComponent(filename)}?category=${encodeURIComponent(category)}&download=1`;

  return (
    <NodeViewWrapper className="my-2">
      <div
        className="inline-flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border bg-muted/40 hover:bg-muted/70 transition-colors max-w-sm"
        contentEditable={false}
      >
        <div className="text-text-muted flex-shrink-0">
          <FileIcon />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-text-primary truncate">
            {originalName || filename}
          </div>
          {size > 0 && (
            <div className="text-xs text-text-muted">{formatSize(size)}</div>
          )}
        </div>
        <a
          href={downloadUrl}
          download={originalName || filename}
          className="flex-shrink-0 p-1.5 rounded hover:bg-border transition-colors text-text-muted hover:text-text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
    </NodeViewWrapper>
  );
}

// ─── TipTap Extension ─────────────────────────────────────────────────────────
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    attachment: {
      insertAttachment: (attrs: AttachmentAttrs) => ReturnType;
    };
  }
}

export const AttachmentExtension = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      filename:     { default: "" },
      originalName: { default: "" },
      mimeType:     { default: "" },
      size:         { default: 0 },
      category:     { default: "General" },
      spaceSlug:    { default: "" },
      url:          { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-attachment]",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return {
            filename:     el.getAttribute("data-filename")      || "",
            originalName: el.getAttribute("data-original-name") || "",
            mimeType:     el.getAttribute("data-mime-type")     || "",
            size:         parseInt(el.getAttribute("data-size") || "0", 10),
            category:     el.getAttribute("data-category")      || "General",
            spaceSlug:    el.getAttribute("data-space-slug")    || "",
            url:          el.getAttribute("data-url")           || "",
          };
        },
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({
        "data-attachment":    "",
        "data-filename":      node.attrs.filename || "",
        "data-original-name": node.attrs.originalName || "",
        "data-mime-type":     node.attrs.mimeType || "",
        "data-size":          String(node.attrs.size || 0),
        "data-category":      node.attrs.category || "",
        "data-space-slug":    node.attrs.spaceSlug || "",
        "data-url":           node.attrs.url || "",
      }),
      "[Attachment]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentNodeView as any);
  },

  addCommands() {
    return {
      insertAttachment: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});
