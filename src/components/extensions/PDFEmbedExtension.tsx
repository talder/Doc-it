"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useEffect, useRef } from "react";
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
  // Ref so we can revoke on unmount without blobUrl being a dep (avoids
  // premature revocation when the state update re-triggers the effect cleanup).
  const blobUrlRef = useRef<string | null>(null);

  // Pre-fetch PDF as blob URL when preview is opened.
  // Always re-type as application/pdf so the browser invokes the PDF viewer
  // regardless of what Content-Type the server sent.
  useEffect(() => {
    if (!showPreview) return;
    if (blobUrlRef.current) { setBlobUrl(blobUrlRef.current); return; }
    let cancelled = false;
    fetch(pdfUrl, { credentials: "same-origin" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        const blob = new Blob([buf], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch((e) => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPreview, pdfUrl]);

  // Revoke blob URL only when component unmounts
  useEffect(() => {
    return () => { if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current); };
  }, []);

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
          <object
            data={blobUrl}
            type="application/pdf"
            className="pdf-embed-iframe"
            aria-label={originalName || filename}
          >
            <div className="pdf-embed-error">
              PDF preview not supported in this browser.{" "}
              <a href={blobUrl || "#"} download={originalName || filename} style={{ color: "inherit", textDecoration: "underline" }}>Download instead</a>
            </div>
          </object>
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
