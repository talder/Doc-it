"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

// ── React NodeView ──────────────────────────────────────────────────────────

function ResizableImageView({ node, updateAttributes, selected, editor }: any) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [resizing, setResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const { src, alt, title, width } = node.attrs;
  const editable = editor?.isEditable ?? false;

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!editable) return;
      e.preventDefault();
      e.stopPropagation();
      startX.current = e.clientX;
      startWidth.current = imgRef.current?.offsetWidth ?? (width || 400);
      setResizing(true);
    },
    [editable, width],
  );

  useEffect(() => {
    if (!resizing) return;

    const onMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX.current;
      const newWidth = Math.max(60, startWidth.current + diff);
      updateAttributes({ width: newWidth });
    };

    const onMouseUp = () => setResizing(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing, updateAttributes]);

  return (
    <NodeViewWrapper className="resizable-image-wrapper" data-drag-handle="">
      <div
        className={`resizable-image-container${selected ? " selected" : ""}`}
        style={{ width: width ? `${width}px` : undefined }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={alt || ""}
          title={title || undefined}
          draggable={false}
          className="resizable-image"
        />
        {editable && (
          <>
            <div className="resize-handle resize-handle--right" onMouseDown={onMouseDown} />
            <div className="resize-handle resize-handle--left" onMouseDown={(e) => {
              if (!editable) return;
              e.preventDefault();
              e.stopPropagation();
              startX.current = e.clientX;
              startWidth.current = imgRef.current?.offsetWidth ?? (width || 400);
              setResizing(true);
              // For left handle, invert the direction
              const origMove = startX.current;
              const origWidth = startWidth.current;
              const handleMove = (ev: MouseEvent) => {
                const diff = origMove - ev.clientX;
                const newWidth = Math.max(60, origWidth + diff);
                updateAttributes({ width: newWidth });
              };
              const handleUp = () => {
                document.removeEventListener("mousemove", handleMove);
                document.removeEventListener("mouseup", handleUp);
                document.body.style.userSelect = "";
                document.body.style.cursor = "";
                setResizing(false);
              };
              document.addEventListener("mousemove", handleMove);
              document.addEventListener("mouseup", handleUp);
              document.body.style.userSelect = "none";
              document.body.style.cursor = "ew-resize";
            }} />
          </>
        )}
        {selected && width && (
          <span className="resize-width-label">{Math.round(width)}px</span>
        )}
      </div>
    </NodeViewWrapper>
  );
}

// ── Extension ───────────────────────────────────────────────────────────────

export const ResizableImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
      width: {
        default: null,
        parseHTML: (element: HTMLElement) => {
          const w = element.getAttribute("width") || element.style.width;
          return w ? parseInt(String(w), 10) || null : null;
        },
        renderHTML: (attributes: Record<string, any>) => {
          if (!attributes.width) return {};
          return { width: attributes.width };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView);
  },

  addCommands() {
    return {
      setImage:
        (options: { src: string; alt?: string; title?: string; width?: number }) =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    } as any;
  },
});
