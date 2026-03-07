"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState, FC } from "react";
import { Pencil, Trash2 } from "lucide-react";

const DRAWIO_URL = "https://embed.diagrams.net/?embed=1&ui=kennedy&spin=1&proto=json&saveAndExit=1&noSaveBtn=0";

const EMPTY_XML = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>';

const DrawioNodeView: FC<any> = ({ node, updateAttributes, deleteNode }) => {
  const [isEditing, setIsEditing] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!isEditing) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.includes("diagrams.net")) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (typeof event.data !== "string" || !event.data.length) return;

      try {
        const msg = JSON.parse(event.data);
        const origin = new URL(DRAWIO_URL).origin;

        if (msg.event === "init") {
          const xml = node.attrs.diagramData || EMPTY_XML;
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ action: "load", xml }),
            origin
          );
        } else if (msg.event === "save") {
          updateAttributes({ diagramData: msg.xml });
          iframeRef.current?.contentWindow?.postMessage(
            JSON.stringify({ action: "export", format: "svg" }),
            origin
          );
        } else if (msg.event === "export") {
          let svgData = msg.data;
          if (typeof svgData === "string" && svgData.startsWith("data:image/svg+xml;base64,")) {
            try {
              svgData = atob(svgData.replace("data:image/svg+xml;base64,", ""));
            } catch { /* keep as-is */ }
          }
          updateAttributes({ svgData });
          setIsEditing(false);
        } else if (msg.event === "exit") {
          setIsEditing(false);
        }
      } catch { /* ignore non-JSON */ }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isEditing, node.attrs.diagramData, updateAttributes]);

  return (
    <NodeViewWrapper className="drawio-block">
      {/* Fullscreen editor modal */}
      {isEditing && (
        <div className="excalidraw-modal-backdrop">
          <div className="excalidraw-modal">
            <div className="excalidraw-modal-header">
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Pencil className="h-4 w-4" />
                Edit Diagram
              </span>
              <button
                onClick={() => setIsEditing(false)}
                className="excalidraw-cancel-btn"
              >
                Close
              </button>
            </div>
            <iframe
              ref={iframeRef}
              src={DRAWIO_URL}
              className="flex-1 w-full border-0"
            />
          </div>
        </div>
      )}

      {/* Inline preview */}
      <div className="excalidraw-preview group">
        {node.attrs.svgData ? (
          <>
            <div className="excalidraw-hover-actions">
              <button onClick={() => setIsEditing(true)} className="excalidraw-action-btn">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button onClick={() => deleteNode()} className="excalidraw-action-btn excalidraw-delete-btn">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
            <div
              className="excalidraw-svg-preview"
              dangerouslySetInnerHTML={{ __html: node.attrs.svgData }}
            />
          </>
        ) : (
          <div className="excalidraw-empty">
            <p className="text-sm text-text-muted mb-3">Draw.io Diagram</p>
            <div className="flex gap-2">
              <button onClick={() => setIsEditing(true)} className="excalidraw-create-btn text-sm">
                <Pencil className="h-4 w-4" /> Create Diagram
              </button>
              <button onClick={() => deleteNode()} className="excalidraw-action-btn excalidraw-delete-btn">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const DrawioExtension = Node.create({
  name: "drawio",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      diagramData: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-drawio-data") || null,
        renderHTML: (attrs) => (attrs.diagramData ? { "data-drawio-data": attrs.diagramData } : {}),
      },
      svgData: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-drawio-svg") || null,
        renderHTML: (attrs) => (attrs.svgData ? { "data-drawio-svg": attrs.svgData } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-drawio]" }];
  },

  renderHTML({ node }) {
    return [
      "div",
      mergeAttributes({
        "data-drawio": "",
        "data-drawio-data": node.attrs.diagramData || "",
        "data-drawio-svg": node.attrs.svgData || "",
      }),
      "[Draw.io Diagram]",
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DrawioNodeView, { as: "div" });
  },

  addCommands() {
    return {
      insertDrawio:
        () =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: { diagramData: null, svgData: null },
          });
        },
    } as any;
  },
});
