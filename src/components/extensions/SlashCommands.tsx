"use client";

import { Extension } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import tippy from "tippy.js";
import {
  Heading1, Heading2, Heading3, Heading4, List, ListOrdered, ListChecks, Code2, Quote,
  Table, ImageIcon, ChevronDown, Lightbulb, Pencil, GitBranch,
  Minus, AlignLeft, AlignCenter, AlignRight, Link, Paperclip,
  FileText, CalendarDays, Clock, Sigma, FileImage, LayoutTemplate, Database, Palette,
} from "lucide-react";
import { SlashCommandsList } from "./SlashCommandsList";
import { PluginKey } from "@tiptap/pm/state";

export interface SlashCommandItem {
  title: string;
  description: string;
  icon: React.ReactNode;
  command: (props: { editor: any; range: any }) => void;
}

const getSlashCommands = (): SlashCommandItem[] => [
  // ── Headings ────────────────────────────────────────────────────────────────
  {
    title: "Heading 1",
    description: "Big section heading",
    icon: <Heading1 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    icon: <Heading2 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    icon: <Heading3 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
    },
  },
  {
    title: "Heading 4",
    description: "Smallest section heading",
    icon: <Heading4 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 4 }).run();
    },
  },
  // ── Lists ────────────────────────────────────────────────────────────────────
  {
    title: "Bullet List",
    description: "Create a bulleted list",
    icon: <List className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a numbered list",
    icon: <ListOrdered className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Create a task list",
    icon: <ListChecks className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  // ── Alignment ────────────────────────────────────────────────────────────────
  {
    title: "Align Left",
    description: "Align text to the left",
    icon: <AlignLeft className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign("left").run();
    },
  },
  {
    title: "Align Center",
    description: "Center align text",
    icon: <AlignCenter className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign("center").run();
    },
  },
  {
    title: "Align Right",
    description: "Align text to the right",
    icon: <AlignRight className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setTextAlign("right").run();
    },
  },
  // ── Content blocks ───────────────────────────────────────────────────────────
  {
    title: "Callout",
    description: "Create a callout block",
    icon: <Lightbulb className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setCallout("info").run();
    },
  },
  {
    title: "Code Block",
    description: "Create a code block",
    icon: <Code2 className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
    },
  },
  {
    title: "Collapsible",
    description: "Collapsible block of content",
    icon: <ChevronDown className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertCollapsible().run();
    },
  },
  {
    title: "Divider",
    description: "Insert a horizontal rule",
    icon: <Minus className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    title: "Quote",
    description: "Create a blockquote",
    icon: <Quote className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run();
    },
  },
  {
    title: "Table",
    description: "Insert a table",
    icon: <Table className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    },
  },
  // ── Insert / Media ───────────────────────────────────────────────────────────
  {
    title: "Attachment",
    description: "Upload a file attachment",
    icon: <Paperclip className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:attachment", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "Drawing",
    description: "Insert an Excalidraw drawing",
    icon: <Pencil className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setExcalidraw().run();
    },
  },
  {
    title: "Diagram (Draw.io)",
    description: "Insert a Draw.io diagram",
    icon: <GitBranch className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).insertDrawio().run();
    },
  },
  {
    title: "Image",
    description: "Insert an image",
    icon: <ImageIcon className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:image", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "Inline Equation",
    description: "Insert a math equation (KaTeX)",
    icon: <Sigma className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:math", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "Link",
    description: "Insert a hyperlink",
    icon: <Link className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:link", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "PDF",
    description: "Upload and embed one or more PDFs",
    icon: <FileText className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:pdf", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  // ── Data / Docs ──────────────────────────────────────────────────────────────
  {
    title: "Insert Enhanced Table",
    description: "Insert an existing enhanced table from this space",
    icon: <Database className="h-4 w-4" style={{ color: "#14b8a6" }} />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:database-existing", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "Linked Document",
    description: "Link to another doc in this space",
    icon: <FileImage className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:linked-doc", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "New Enhanced Table",
    description: "Create and insert a new enhanced table",
    icon: <Database className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:database", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  {
    title: "Template Field",
    description: "Insert a template placeholder field",
    icon: <LayoutTemplate className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      document.dispatchEvent(new CustomEvent("slash:template-field", {
        detail: { editor },
        bubbles: true,
      }));
    },
  },
  // ── Date / Time ──────────────────────────────────────────────────────────────
  {
    title: "Date Now",
    description: "Insert current date & time",
    icon: <Clock className="h-4 w-4" />,
    command: ({ editor, range }) => {
      const now = new Date().toLocaleString(undefined, {
        year: "numeric", month: "long", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
      editor.chain().focus().deleteRange(range).insertContent(now).run();
    },
  },
  {
    title: "Date Today",
    description: "Insert today's date",
    icon: <CalendarDays className="h-4 w-4" />,
    command: ({ editor, range }) => {
      const date = new Date().toLocaleDateString(undefined, {
        year: "numeric", month: "long", day: "numeric",
      });
      editor.chain().focus().deleteRange(range).insertContent(date).run();
    },
  },
  {
    title: "Color Swatch",
    description: "Insert a colored rectangle with hex code",
    icon: <Palette className="h-4 w-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const view = editor.view;
      const from = editor.state.selection.from;
      const coords = view.coordsAtPos(from);
      document.dispatchEvent(new CustomEvent("slash:color", {
        detail: { editor, coords },
        bubbles: true,
      }));
    },
  },
  {
    title: "Emoji",
    description: "Insert an emoji from the picker",
    icon: <span style={{ fontSize: "14px", lineHeight: 1 }}>😊</span>,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const view = editor.view;
      const from = editor.state.selection.from;
      const coords = view.coordsAtPos(from);
      document.dispatchEvent(new CustomEvent("slash:emoji", {
        detail: { editor, coords },
        bubbles: true,
      }));
    },
  },
];

export const SlashCommands = Extension.create({
  name: "slashCommands",

  addOptions() {
    return {
      suggestion: {
        char: "/",
        allow: ({ editor }: { editor: any }) => !editor.isActive("codeBlock"),
        command: ({ editor, range, props }: { editor: any; range: any; props: SlashCommandItem }) => {
          props.command({ editor, range });
        },
        items: ({ query }: { query: string }) => {
          return getSlashCommands().filter(
            (item) =>
              item.title.toLowerCase().includes(query.toLowerCase()) ||
              item.description.toLowerCase().includes(query.toLowerCase())
          );
        },
        render: () => {
          let component: ReactRenderer;
          let popup: any;

          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashCommandsList, {
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
                const inst = popup?.[0] ?? popup;
                inst?.hide?.();
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
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        pluginKey: new PluginKey("slashSuggestion"),
      }),
    ];
  },
});
