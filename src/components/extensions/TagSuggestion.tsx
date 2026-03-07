"use client";

import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy from "tippy.js";
import { TagMentionsList } from "./TagMentionsList";
import { PluginKey } from "@tiptap/pm/state";

// Module-level tag data, updated from Editor via command
let tagData: string[] = [];

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    tagSuggestion: {
      updateTagData: (tags: string[]) => ReturnType;
    };
  }
}

export const TagSuggestion = Extension.create({
  name: "tagSuggestion",

  addCommands() {
    return {
      updateTagData:
        (tags: string[]) =>
        () => {
          tagData = tags || [];
          return true;
        },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: "#",
        allowSpaces: false,
        pluginKey: new PluginKey("hashSuggestion"),
        allow: ({ editor }) => !editor.isActive("codeBlock"),

        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: "tagLink",
              attrs: { tag: props.tag },
            })
            .insertContent(" ")
            .run();
        },

        items: ({ query }) => {
          const lowerQuery = query.toLowerCase().trim();
          const filtered = tagData
            .filter((tag) => tag.toLowerCase().includes(lowerQuery))
            .slice(0, 9)
            .map((tag) => ({ tag, display: tag }));

          // Allow creating new tags by typing
          if (
            lowerQuery &&
            !tagData.some((t) => t.toLowerCase() === lowerQuery)
          ) {
            filtered.unshift({ tag: lowerQuery, display: lowerQuery });
          }

          return filtered;
        },

        render: () => {
          let component: ReactRenderer;
          let popup: any;

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(TagMentionsList, {
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
