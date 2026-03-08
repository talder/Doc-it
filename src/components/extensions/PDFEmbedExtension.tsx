"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useEffect } from "react";
import { FileText, Eye, EyeOff, ExternalLink, Download, Trash2 } from "lucide-react";

// ─── PDF Attrs ────────────────────────────────────────────────────────────────
export interface PDFEmbedAttrs {
  filename: string;
  originalName: string;
  category: string;
  spaceSlug: string;
  url: string;
}

// ─── Node View ────────────────────────────────────────────────────────────────
function PDFEmbedNodeView({ node, deleteNode }: { node: { attrs: PDFEmbedAttrs }; deleteNode: () => void }) {
  const { filename, originalName, category, spaceSlug, url } = node.attrs;

  const pdfUrl =
    url ||
    `/api/spaces/${encodeURIComponent(spaceSlug)}/attachments/${encodeURIComponent(filename)}?category=${encodeURIComponent(category)}`;

  const [showPreview, setShowPreview] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Pre-fetch PDF as blob URL when preview is opened (iframes can't send cookies)
  useEffect(() => {
    if (!showPreview) return;
    if (blobUrl) return;
    let revoke: string | null = null;
    fetch(pdfUrl, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        revoke = URL.createObjectURL(blob);
        setBlobUrl(revoke);
      })
      .catch((e) => setError(String(e)));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [showPreview, pdfUrl, blobUrl]);

  return (
    <NodeViewWrapper className="pdf-embed-wrapper" data-drag-handle="">
      {/* ─ Card header ─ */}
      <div className="pdf-embed-card">
        <div className="pdf-embed-info">
          <FileText className="w-5 h-5 text-red-500 shrink-0" />
          <span className="pdf-embed-name" title={originalName || filename}>
            {originalName || filename}
          </span>
        </div>

        <div className="pdf-embed-actions">
          <button
            className="pdf-embed-btn"
            onClick={() => { setShowPreview((v) => !v); setError(null); }}
            title={showPreview ? "Hide preview" : "Show preview"}
          >
            {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span className="hidden sm:inline text-xs">{showPreview ? "Hide" : "Preview"}</span>
          </button>

          <a
            href={pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pdf-embed-btn"
            title="Open in new tab"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          <a
            href={`${pdfUrl}&download=1`}
            download={originalName || filename}
            className="pdf-embed-btn"
            title="Download"
            onClick={(e) => e.stopPropagation()}
          >
            <Download className="w-4 h-4" />
          </a>

          <button className="pdf-embed-btn pdf-embed-btn--delete" onClick={() => deleteNode()} title="Remove">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ─ Inline preview ─ */}
      {showPreview && (
        <div className="pdf-embed-preview">
          {error ? (
            <div className="pdf-embed-error">{error}</div>
          ) : !blobUrl ? (
            <div className="pdf-embed-loading">Loading PDF…</div>
          ) : (
            <iframe src={blobUrl} className="pdf-embed-iframe" title={originalName || filename} />
          )}
        </div>
      )}
    </NodeViewWrapper>
  );
}

// ─── TipTap Extension ─────────────────────────────────────────────────────────
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pdfEmbed: {
      insertPDFEmbed: (attrs: PDFEmbedAttrs) => ReturnType;
    };
  }
}

export const PDFEmbedExtension = Node.create({
  name: "pdfEmbed",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      filename:     { default: "" },
      originalName: { default: "" },
      category:     { default: "General" },
      spaceSlug:    { default: "" },
      url:          { default: "" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-pdf-embed]",
        getAttrs: (node) => {
          const el = node as HTMLElement;
          return {
            filename:     el.getAttribute("data-filename")      || "",
            originalName: el.getAttribute("data-original-name") || "",
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
        "data-pdf-embed":     "",
        "data-filename":      node.attrs.filename || "",
        "data-original-name": node.attrs.originalName || "",
        "data-category":      node.attrs.category || "",
        "data-space-slug":    node.attrs.spaceSlug || "",
        "data-url":           node.attrs.url || "",
      }),
      "[PDF]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(PDFEmbedNodeView as any);
  },

  addCommands() {
    return {
      insertPDFEmbed: (attrs) => ({ commands }) =>
        commands.insertContent({ type: this.name, attrs }),
    };
  },
});
