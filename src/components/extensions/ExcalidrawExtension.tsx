"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState, useEffect, useRef, useCallback, FC } from "react";
import { Pencil, Trash2, Maximize2, Download, X, ImageDown } from "lucide-react";
import dynamic from "next/dynamic";

const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

// ── helpers ──

async function saveDrawing(
  drawingId: string | null,
  docName: string,
  sceneData: any,
  svgData: string
): Promise<string> {
  const res = await fetch("/api/assets/excalidraw", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: drawingId, docName, sceneData, svgData }),
  });
  const { id } = await res.json();
  return id;
}

async function loadDrawing(
  drawingId: string
): Promise<{ sceneData: any; svgData: string } | null> {
  const res = await fetch(`/api/assets/excalidraw/${encodeURIComponent(drawingId)}`);
  if (!res.ok) return null;
  const data = await res.json();
  return { sceneData: data.sceneData, svgData: data.svgData };
}

async function deleteDrawing(drawingId: string) {
  await fetch(`/api/assets/excalidraw/${encodeURIComponent(drawingId)}`, {
    method: "DELETE",
  });
}

// ── Library cache (loaded once, shared across all instances) ──
let _libraryItemsCache: any[] | null = null;
async function getLibraryItems(): Promise<any[]> {
  if (_libraryItemsCache) return _libraryItemsCache;
  try {
    const res = await fetch("/libraries/all-libraries.json");
    if (!res.ok) { console.error("[Library] fetch failed:", res.status, res.url); return []; }
    _libraryItemsCache = await res.json();
    console.log("[Library] fetched", _libraryItemsCache!.length, "items");
  } catch (e) { console.error("[Library] load error:", e); }
  return _libraryItemsCache || [];
}

// ── NodeView ──

const ExcalidrawNodeView: FC<any> = ({ node, updateAttributes, deleteNode, editor }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isViewing, setIsViewing] = useState(false);
  const [svgPreview, setSvgPreview] = useState<string | null>(null);
  const [initialData, setInitialData] = useState<any>(null);
  const excalidrawAPIRef = useRef<any>(null);
  // Stored as state so useEffect fires after the API is available
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);

  const drawingId: string | null = node.attrs.drawingId || null;

  const downloadSvg = useCallback(() => {
    if (!svgPreview) return;
    const blob = new Blob([svgPreview], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "drawing.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [svgPreview]);

  const downloadPng = useCallback(() => {
    if (!svgPreview) return;
    const blob = new Blob([svgPreview], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = img.naturalWidth * scale || 1600;
      canvas.height = img.naturalHeight * scale || 900;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = "drawing.png";
      a.click();
    };
    img.src = url;
  }, [svgPreview]);

  // Derive the doc name
  const getDocName = (): string => {
    // Try to get from the closest page context
    const header = document.querySelector("header span");
    const text = header?.textContent || "";
    return text.replace(/\.md$/, "") || "untitled";
  };

  // Load SVG preview on mount / when drawingId changes
  useEffect(() => {
    if (!drawingId) {
      setSvgPreview(null);
      return;
    }
    loadDrawing(drawingId).then((data) => {
      if (data) setSvgPreview(data.svgData);
    });
  }, [drawingId]);

  // Load library once the Excalidraw API is ready (after component mounts)
  useEffect(() => {
    if (!excalidrawAPI) return;
    getLibraryItems().then((items) => {
      if (items.length > 0) {
        excalidrawAPI.updateLibrary({
          libraryItems: items,
          merge: false,
          defaultStatus: "published",
        });
      }
    });
  }, [excalidrawAPI]);

  // Lazy-load Excalidraw CSS when editing
  useEffect(() => {
    if (!isEditing) return;
    const id = "excalidraw-lazy-css";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/themes/excalidraw/excalidraw.css";
    document.head.appendChild(link);
  }, [isEditing]);

  const openEditor = async () => {
    if (drawingId) {
      const data = await loadDrawing(drawingId);
      if (data) {
        setInitialData({
          elements: data.sceneData.elements || [],
          appState: { ...data.sceneData.appState, zoom: { value: 0.5 } },
          files: data.sceneData.files || null,
        });
      } else {
        setInitialData({ elements: [], appState: {}, files: null });
      }
    } else {
      setInitialData({ elements: [], appState: {}, files: null });
    }
    setIsEditing(true);
  };

  const handleSave = async () => {
    const api = excalidrawAPIRef.current;
    if (!api) return;

    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();

    const sceneData = {
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        currentItemStrokeColor: appState.currentItemStrokeColor,
        currentItemBackgroundColor: appState.currentItemBackgroundColor,
        currentItemFillStyle: appState.currentItemFillStyle,
        currentItemStrokeWidth: appState.currentItemStrokeWidth,
        currentItemRoughness: appState.currentItemRoughness,
        currentItemOpacity: appState.currentItemOpacity,
        gridSize: appState.gridSize,
        zoom: appState.zoom,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
      },
      files: files || null,
    };

    // Generate SVG
    const { exportToSvg } = await import("@excalidraw/excalidraw");
    const svg = await exportToSvg({
      elements,
      appState,
      files,
      exportPadding: 20,
    });
    svg.setAttribute("width", "100%");
    svg.removeAttribute("height");
    const svgString = svg.outerHTML;

    // Save to disk via API
    const savedId = await saveDrawing(drawingId, getDocName(), sceneData, svgString);

    updateAttributes({ drawingId: savedId });
    setSvgPreview(svgString);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (drawingId) await deleteDrawing(drawingId);
    deleteNode();
  };

  return (
    <NodeViewWrapper className="excalidraw-block">
      {/* Lightbox viewer */}
      {isViewing && svgPreview && (
        <div
          className="excalidraw-modal-backdrop"
          onClick={() => setIsViewing(false)}
        >
          <div
            className="drawio-lightbox"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="excalidraw-modal-header">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Maximize2 className="h-4 w-4" />
                Drawing
              </span>
              <div className="flex items-center gap-2">
                <button onClick={downloadSvg} className="excalidraw-action-btn" title="Download SVG">
                  <Download className="h-3.5 w-3.5" /> SVG
                </button>
                <button onClick={downloadPng} className="excalidraw-action-btn" title="Download PNG">
                  <ImageDown className="h-3.5 w-3.5" /> PNG
                </button>
                <button onClick={() => setIsViewing(false)} className="excalidraw-cancel-btn">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="drawio-lightbox-body">
              <div
                className="drawio-lightbox-svg"
                dangerouslySetInnerHTML={{ __html: svgPreview }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Full-screen editor modal */}
      {isEditing && initialData && (
        <div className="excalidraw-modal-backdrop">
          <div className="excalidraw-modal">
            <div className="excalidraw-modal-header">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Pencil className="h-4 w-4" />
                Edit Drawing
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(false)}
                  className="excalidraw-cancel-btn"
                >
                  Cancel
                </button>
                <button onClick={handleSave} className="excalidraw-save-btn">
                  Save
                </button>
              </div>
            </div>
            <div className="excalidraw-modal-canvas">
              <Excalidraw
                excalidrawAPI={(api: any) => {
                  excalidrawAPIRef.current = api;
                  setExcalidrawAPI(api);
                }}
                initialData={initialData}
              />
            </div>
          </div>
        </div>
      )}

      {/* Inline preview / placeholder */}
      <div className="excalidraw-preview group">
        {drawingId && svgPreview ? (
          <>
            <div className="excalidraw-hover-actions">
              <button onClick={() => setIsViewing(true)} className="excalidraw-action-btn">
                <Maximize2 className="h-3.5 w-3.5" /> View
              </button>
              <button onClick={openEditor} className="excalidraw-action-btn">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={handleDelete}
                className="excalidraw-action-btn excalidraw-delete-btn"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
            <div
              className="excalidraw-svg-preview cursor-zoom-in"
              onMouseDown={(e) => { e.preventDefault(); setIsViewing(true); }}
              dangerouslySetInnerHTML={{ __html: svgPreview }}
            />
          </>
        ) : (
          <div className="excalidraw-empty">
            <button onClick={openEditor} className="excalidraw-create-btn">
              <Pencil className="h-5 w-5" />
              Create Drawing
            </button>
            <button
              onClick={handleDelete}
              className="excalidraw-action-btn excalidraw-delete-btn ml-2"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// ── Tiptap Node ──

export const ExcalidrawExtension = Node.create({
  name: "excalidraw",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      drawingId: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-drawing-id") || null,
        renderHTML: (attributes) => {
          if (!attributes.drawingId) return {};
          return { "data-drawing-id": attributes.drawingId };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-excalidraw]",
        getAttrs: (element) => ({
          drawingId:
            (element as HTMLElement).getAttribute("data-drawing-id") || null,
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({
        "data-excalidraw": "",
        "data-drawing-id": node.attrs.drawingId || "",
      }),
      "[Excalidraw Drawing]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ExcalidrawNodeView, {
      as: "div",
      contentDOMElementTag: "div",
    });
  },

  addCommands() {
    return {
      setExcalidraw:
        () =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: { drawingId: null },
          });
        },
    } as any;
  },
});
