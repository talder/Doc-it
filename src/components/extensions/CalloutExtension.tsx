"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from "@tiptap/react";
import { FC, useState, useRef, useEffect } from "react";
import { Lightbulb, AlertTriangle, CheckCircle, AlertCircle } from "lucide-react";

export type CalloutType = "info" | "warning" | "success" | "danger";

const CalloutIcons: Record<CalloutType, any> = {
  info: Lightbulb,
  warning: AlertTriangle,
  success: CheckCircle,
  danger: AlertCircle,
};

const CalloutLabels: Record<CalloutType, string> = {
  info: "Info",
  warning: "Warning",
  success: "Success",
  danger: "Danger",
};

const CalloutNodeView: FC<any> = ({ node, updateAttributes }) => {
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const calloutType: CalloutType = node.attrs.type || "info";
  const IconComponent = CalloutIcons[calloutType];

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as globalThis.Node)) {
        setShowPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <NodeViewWrapper
      className={`callout callout-${calloutType} my-4`}
      data-type="callout"
      data-callout-type={calloutType}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0 select-none pt-0.5 relative" ref={pickerRef}>
          <button
            className={`callout-icon-button p-1 rounded hover:bg-black/5 transition-colors cursor-pointer callout-icon-${calloutType}`}
            onClick={() => setShowPicker(!showPicker)}
            title="Change callout type"
          >
            <IconComponent className="h-5 w-5" />
          </button>
          {showPicker && (
            <div className="absolute top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-lg p-1 z-50 min-w-[140px]">
              {(Object.keys(CalloutIcons) as CalloutType[]).map((type) => {
                const TypeIcon = CalloutIcons[type];
                return (
                  <button
                    key={type}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded hover:bg-muted ${
                      type === calloutType ? "bg-muted" : ""
                    }`}
                    onClick={() => {
                      updateAttributes({ type });
                      setShowPicker(false);
                    }}
                  >
                    <TypeIcon className={`h-4 w-4 callout-icon-${type}`} />
                    <span>{CalloutLabels[type]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <NodeViewContent className="callout-content" />
        </div>
      </div>
    </NodeViewWrapper>
  );
};

export const CalloutExtension = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      type: {
        default: "info",
        parseHTML: (element) =>
          (element.getAttribute("data-callout-type") as CalloutType) || "info",
        renderHTML: (attributes) => ({
          "data-callout-type": attributes.type,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="callout"]',
        getAttrs: (dom) => {
          const element = dom as HTMLElement;
          return { type: element.getAttribute("data-callout-type") || "info" };
        },
        contentElement: (dom: HTMLElement) => {
          return dom.querySelector(".callout-content") || dom;
        },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const type = node.attrs.type || "info";
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        "data-callout-type": type,
        class: `callout callout-${type}`,
      }),
      [
        "div",
        { class: "callout-wrapper" },
        ["span", { class: `callout-icon callout-icon-${type}` }],
        ["div", { class: "callout-content" }, 0],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutNodeView);
  },

  addCommands() {
    return {
      setCallout:
        (type: CalloutType = "info") =>
        ({ commands }: any) => {
          return commands.insertContent({
            type: this.name,
            attrs: { type },
            content: [{ type: "paragraph" }],
          });
        },
    } as any;
  },

  addKeyboardShortcuts() {
    return {
      Backspace: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty) return false;
        if ($from.parentOffset === 0 && $from.depth >= 2) {
          const calloutDepth = $from.depth - 1;
          const calloutNode = $from.node(calloutDepth);
          if (calloutNode?.type.name === "callout") {
            const indexInCallout = $from.index(calloutDepth);
            if (indexInCallout === 0) return editor.commands.lift("callout");
          }
        }
        return false;
      },
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        const { $from, empty } = selection;
        if (!empty) return false;
        for (let depth = $from.depth; depth > 0; depth--) {
          const node = $from.node(depth);
          if (node.type.name === "callout") {
            const parent = $from.parent;
            const isEmptyParagraph = parent.type.name === "paragraph" && parent.content.size === 0;
            const calloutNode = $from.node(depth);
            const indexInCallout = $from.index(depth);
            const isLastChild = indexInCallout === calloutNode.childCount - 1;
            if (isEmptyParagraph && isLastChild) {
              const pos = $from.after(depth);
              return editor
                .chain()
                .deleteNode("paragraph")
                .insertContentAt(pos, { type: "paragraph" })
                .focus()
                .run();
            }
            break;
          }
        }
        return false;
      },
    };
  },
});
