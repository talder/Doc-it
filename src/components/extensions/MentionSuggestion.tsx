"use client";

import { Extension } from "@tiptap/core";
import { Node as PmNode, mergeAttributes } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy from "tippy.js";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { PluginKey } from "@tiptap/pm/state";

// ── Module-level member data ──────────────────────────────────────────────────
let memberData: { username: string; fullName?: string }[] = [];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    mentionSuggestion: {
      updateMemberData: (members: { username: string; fullName?: string }[]) => ReturnType;
    };
  }
}

// ── Inline Mention node ───────────────────────────────────────────────────────
export const MentionNode = PmNode.create({
  name: "mention",
  group: "inline",
  inline: true,
  selectable: false,
  atom: true,

  addAttributes() {
    return {
      username: { default: null },
      label: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-mention]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-mention": HTMLAttributes.username,
        class: "mention-chip",
      }),
      `@${HTMLAttributes.label || HTMLAttributes.username}`,
    ];
  },
});

// ── Suggestion list UI ────────────────────────────────────────────────────────
interface MentionItem {
  username: string;
  fullName?: string;
}

interface MentionListProps {
  items: MentionItem[];
  command: (item: MentionItem) => void;
}

const MentionList = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  MentionListProps
>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => setSelectedIndex(0), [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((prev) => Math.min(items.length - 1, prev + 1));
        return true;
      }
      if (event.key === "Enter") {
        selectItem(selectedIndex);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="tag-mentions-popup">
        <div className="tag-mentions-empty">No members found</div>
      </div>
    );
  }

  return (
    <div className="tag-mentions-popup">
      <div className="tag-mentions-list">
        {items.map((item, index) => (
          <button
            key={item.username}
            className={`tag-mentions-item${index === selectedIndex ? " selected" : ""}`}
            onClick={() => selectItem(index)}
          >
            <span className="mention-avatar-mini">
              {item.username.charAt(0).toUpperCase()}
            </span>
            <span>{item.fullName || item.username}</span>
            {item.fullName && (
              <span style={{ opacity: 0.5, marginLeft: 4, fontSize: "0.85em" }}>
                @{item.username}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
});
MentionList.displayName = "MentionList";

// ── Mention suggestion extension ──────────────────────────────────────────────
export const MentionSuggestion = Extension.create({
  name: "mentionSuggestion",

  addCommands() {
    return {
      updateMemberData:
        (members: { username: string; fullName?: string }[]) =>
        () => {
          memberData = members || [];
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "@",
        allowSpaces: false,
        pluginKey: new PluginKey("mentionSuggestion"),
        allow: ({ editor }) => !editor.isActive("codeBlock"),

        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "mention",
              attrs: {
                username: props.username,
                label: props.fullName || props.username,
              },
            })
            .insertContent(" ")
            .run();

          // Fire a custom event so the parent can send a notification
          document.dispatchEvent(
            new CustomEvent("mention:user", {
              detail: { username: props.username },
            })
          );
        },

        items: ({ query }) => {
          const lq = query.toLowerCase();
          return memberData
            .filter(
              (m) =>
                m.username.toLowerCase().includes(lq) ||
                (m.fullName && m.fullName.toLowerCase().includes(lq))
            )
            .slice(0, 8);
        },

        render: () => {
          let component: ReactRenderer;
          let popup: any;

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(MentionList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) return;

              const referenceElement = document.createElement("div");
              referenceElement.style.position = "absolute";
              referenceElement.style.pointerEvents = "none";
              referenceElement.style.zIndex = "10";
              document.body.appendChild(referenceElement);

              const rect = props.clientRect();
              referenceElement.style.left = `${rect.left}px`;
              referenceElement.style.top = `${rect.top}px`;

              popup = tippy(referenceElement, {
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
                theme: "light",
                maxWidth: "none",
                appendTo: () => document.body,
              });
              (popup as any).referenceElement = referenceElement;
            },

            onUpdate(props: any) {
              component.updateProps(props);
              if (!props.clientRect) return;
              const rect = props.clientRect();
              const referenceElement = (popup as any).referenceElement;
              if (referenceElement) {
                referenceElement.style.left = `${rect.left}px`;
                referenceElement.style.top = `${rect.top}px`;
              }
            },

            onKeyDown(props: any) {
              if (props.event.key === "Escape") {
                popup[0].hide();
                return true;
              }
              return (component.ref as any)?.onKeyDown?.(props.event);
            },

            onExit() {
              if (popup && popup[0]) {
                popup[0].destroy();
                const referenceElement = (popup as any).referenceElement;
                if (referenceElement?.parentNode) {
                  referenceElement.parentNode.removeChild(referenceElement);
                }
              }
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});
