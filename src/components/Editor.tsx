"use client";

import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TaskItem } from "@tiptap/extension-task-item";
import { TaskList } from "@tiptap/extension-task-list";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Link from "@tiptap/extension-link";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { common, createLowlight } from "lowlight";
import { useEffect, useRef, useCallback, useState } from "react";
import { marked, type MarkedExtension } from "marked";
import TurndownService from "turndown";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Link as LinkIcon, Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  Highlighter, Eraser, Palette, Type,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from "lucide-react";

import { SlashCommands } from "./extensions/SlashCommands";
import { CalloutExtension } from "./extensions/CalloutExtension";
import { CodeBlockNodeView } from "./extensions/CodeBlockNodeView";
import { DragHandle } from "./extensions/DragHandle";
import { ExcalidrawExtension } from "./extensions/ExcalidrawExtension";
import { DrawioExtension } from "./extensions/DrawioExtension";
import { FontSize } from "./extensions/FontSize";
import { TagLink, setTagClickHandler } from "./extensions/TagLink";
import { TagSuggestion } from "./extensions/TagSuggestion";
import { CollapsibleList } from "./extensions/CollapsibleList";

const lowlight = createLowlight(common);

// Custom marked extensions for callouts and excalidraw
const calloutTypes = ["info", "warning", "success", "danger"];

const markedCalloutExtension: MarkedExtension = {
  renderer: {
    blockquote({ tokens }) {
      // Render inner tokens to get text content
      const inner = this.parser.parse(tokens);
      // Check if first line matches [!type]
      const match = inner.match(/^\s*<p>\s*\[!(\w+)\]\s*<\/p>/);
      if (match && calloutTypes.includes(match[1])) {
        const type = match[1];
        // Everything after the [!type] line is the content
        const content = inner.replace(/^\s*<p>\s*\[!\w+\]\s*<\/p>/, "").trim();
        return `<div data-type="callout" data-callout-type="${type}" class="callout callout-${type}"><div class="callout-content">${content || "<p></p>"}</div></div>`;
      }
      // Check for inline format: [!type] followed by text on same line
      const inlineMatch = inner.match(/^\s*<p>\s*\[!(\w+)\]\s*([\s\S]*?)<\/p>/);
      if (inlineMatch && calloutTypes.includes(inlineMatch[1])) {
        const type = inlineMatch[1];
        const text = inlineMatch[2].trim();
        const rest = inner.replace(/^\s*<p>\s*\[!\w+\]\s*[\s\S]*?<\/p>/, "").trim();
        const content = text ? `<p>${text}</p>${rest}` : rest || "<p></p>";
        return `<div data-type="callout" data-callout-type="${type}" class="callout callout-${type}"><div class="callout-content">${content}</div></div>`;
      }
      return `<blockquote>${inner}</blockquote>\n`;
    },
    html({ text }) {
      // Handle excalidraw HTML comments: <!-- excalidraw:drawing-id -->
      const trimmed = text.trim();
      const excalidrawMatch = trimmed.match(/^<!--\s*excalidraw:([\w-]+)\s*-->$/);
      if (excalidrawMatch) {
        const drawingId = excalidrawMatch[1];
        return `<div data-excalidraw="" data-drawing-id="${drawingId}">[Excalidraw Drawing]</div>\n`;
      }
      // Handle drawio HTML comments: <!-- drawio:{base64-xml} -->
      const drawioMatch = trimmed.match(/^<!--\s*drawio:([A-Za-z0-9+/=]+)\s*-->$/);
      if (drawioMatch) {
        const xml = atob(drawioMatch[1]);
        return `<div data-drawio="" data-drawio-data="${xml.replace(/"/g, '&quot;')}">[Draw.io Diagram]</div>\n`;
      }
      // Handle drawio with SVG: <!-- drawio:{base64-xml}|{base64-svg} -->
      const drawioSvgMatch = trimmed.match(/^<!--\s*drawio:([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)\s*-->$/);
      if (drawioSvgMatch) {
        const xml = atob(drawioSvgMatch[1]);
        const svg = atob(drawioSvgMatch[2]);
        return `<div data-drawio="" data-drawio-data="${xml.replace(/"/g, '&quot;')}" data-drawio-svg="${svg.replace(/"/g, '&quot;')}">[Draw.io Diagram]</div>\n`;
      }
      return text;
    },
  },
};

// Marked extension: parse <span data-tag="..."> from markdown (preserved as HTML)
// Also convert raw #tag patterns in text to tag spans
const markedTagExtension: MarkedExtension = {
  extensions: [{
    name: "hashtag",
    level: "inline",
    start(src: string) {
      return src.match(/(?:^|[\s(])#[a-zA-Z]/)?.index;
    },
    tokenizer(src: string) {
      const match = src.match(/^#([a-zA-Z][a-zA-Z0-9_/-]*)/);
      if (match) {
        return {
          type: "hashtag",
          raw: match[0],
          tag: match[1].toLowerCase(),
        };
      }
      return undefined;
    },
    renderer(token: any) {
      return `<span data-tag="${token.tag}">#${token.tag}</span>`;
    },
  }],
};

marked.use(markedCalloutExtension);
marked.use(markedTagExtension);

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

// Custom turndown rule for callouts
turndown.addRule("callout", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      node.getAttribute("data-type") === "callout"
    );
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const type = el.getAttribute("data-callout-type") || "info";
    return `\n> [!${type}]\n> ${content.trim().replace(/\n/g, "\n> ")}\n\n`;
  },
});

// Custom turndown rule for Draw.io
turndown.addRule("drawio", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      node.hasAttribute("data-drawio")
    );
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const xml = el.getAttribute("data-drawio-data") || "";
    const svg = el.getAttribute("data-drawio-svg") || "";
    if (!xml) return "";
    const xmlB64 = btoa(xml);
    if (svg) {
      const svgB64 = btoa(svg);
      return `\n<!-- drawio:${xmlB64}|${svgB64} -->\n\n`;
    }
    return `\n<!-- drawio:${xmlB64} -->\n\n`;
  },
});

// Custom turndown rule for excalidraw — just stores the drawing ID
turndown.addRule("excalidraw", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      node.hasAttribute("data-excalidraw")
    );
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const drawingId = el.getAttribute("data-drawing-id") || "";
    if (!drawingId) return "";
    return `\n<!-- excalidraw:${drawingId} -->\n\n`;
  },
});

// Turndown rules for inline formatting marks
turndown.addRule("underline", {
  filter: ["u"],
  replacement: (content) => `<u>${content}</u>`,
});
turndown.addRule("highlight", {
  filter: (node) => node.nodeName === "MARK",
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const color = el.getAttribute("data-color") || el.style?.backgroundColor || "";
    if (color) return `<mark data-color="${color}" style="background-color: ${color}">${content}</mark>`;
    return `==${content}==`;
  },
});
turndown.addRule("superscript", {
  filter: ["sup"],
  replacement: (content) => `<sup>${content}</sup>`,
});
turndown.addRule("subscript", {
  filter: ["sub"],
  replacement: (content) => `<sub>${content}</sub>`,
});
turndown.addRule("textColor", {
  filter: (node) => {
    return node.nodeName === "SPAN" && !!(node as HTMLElement).style?.color;
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const color = el.style.color || "";
    const fontSize = el.style.fontSize || "";
    const styles = [color ? `color: ${color}` : "", fontSize ? `font-size: ${fontSize}` : ""].filter(Boolean).join("; ");
    return `<span style="${styles}">${content}</span>`;
  },
});
turndown.addRule("textAlign", {
  filter: (node) => {
    if (!["P", "H1", "H2", "H3", "H4", "H5", "H6"].includes(node.nodeName)) return false;
    const align = (node as HTMLElement).style?.textAlign;
    return !!align && align !== "left";
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const tag = el.nodeName.toLowerCase();
    const align = el.style.textAlign;
    return `\n<${tag} style="text-align: ${align}">${content}</${tag}>\n`;
  },
});

// Turndown rule for TagLink nodes
turndown.addRule("tagLink", {
  filter: (node) => {
    return node.nodeName === "SPAN" && !!(node as HTMLElement).getAttribute("data-tag");
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const tag = el.getAttribute("data-tag") || "";
    return `<span data-tag="${tag}">#${tag}</span>`;
  },
});

// Custom turndown rule for task lists
turndown.addRule("taskListItem", {
  filter: (node) => {
    return (
      node.nodeName === "LI" &&
      node.getAttribute("data-type") === "taskItem"
    );
  },
  replacement: (content, node) => {
    const el = node as HTMLElement;
    const checked = el.getAttribute("data-checked") === "true";
    return `${checked ? "- [x]" : "- [ ]"} ${content.trim()}\n`;
  },
});

const HIGHLIGHT_COLORS = [
  { name: "Yellow", color: "#fef08a" },
  { name: "Green", color: "#bbf7d0" },
  { name: "Blue", color: "#bfdbfe" },
  { name: "Purple", color: "#e9d5ff" },
  { name: "Pink", color: "#fbcfe8" },
  { name: "Orange", color: "#fed7aa" },
  { name: "Red", color: "#fecaca" },
  { name: "Gray", color: "#e5e7eb" },
];

const TEXT_COLORS = [
  { name: "Default", color: "" },
  { name: "Red", color: "#ef4444" },
  { name: "Orange", color: "#f97316" },
  { name: "Yellow", color: "#eab308" },
  { name: "Green", color: "#22c55e" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Purple", color: "#a855f7" },
  { name: "Pink", color: "#ec4899" },
  { name: "Gray", color: "#6b7280" },
];

const FONT_SIZES = [
  { name: "Small", size: "0.8em" },
  { name: "Normal", size: "" },
  { name: "Large", size: "1.25em" },
  { name: "Huge", size: "1.5em" },
];

function HighlightColorButton({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!editor) return null;

  const activeColor = editor.getAttributes("highlight")?.color;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`bubble-btn${editor.isActive("highlight") ? " active" : ""}`}
        title="Highlight"
      >
        <Highlighter className="w-4 h-4" />
        {activeColor && (
          <span
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
            style={{ background: activeColor }}
          />
        )}
      </button>
      {open && (
        <div className="highlight-picker">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.color}
              title={c.name}
              className={`highlight-swatch${activeColor === c.color ? " ring-2 ring-accent" : ""}`}
              style={{ background: c.color }}
              onClick={() => {
                editor.chain().focus().toggleHighlight({ color: c.color }).run();
                setOpen(false);
              }}
            />
          ))}
          {editor.isActive("highlight") && (
            <button
              className="highlight-remove"
              onClick={() => {
                editor.chain().focus().unsetHighlight().run();
                setOpen(false);
              }}
            >
              <Eraser className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TextColorButton({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!editor) return null;

  const activeColor = editor.getAttributes("textStyle")?.color;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`bubble-btn${activeColor ? " active" : ""}`}
        title="Text color"
      >
        <Palette className="w-4 h-4" />
        {activeColor && (
          <span
            className="absolute bottom-1 left-1/2 -translate-x-1/2 w-3 h-0.5 rounded-full"
            style={{ background: activeColor }}
          />
        )}
      </button>
      {open && (
        <div className="highlight-picker">
          {TEXT_COLORS.map((c) => (
            <button
              key={c.name}
              title={c.name}
              className={`highlight-swatch${activeColor === c.color ? " ring-2 ring-accent" : ""}`}
              style={c.color ? { background: c.color } : { background: "var(--color-text-primary)", position: "relative" }}
              onClick={() => {
                if (c.color) {
                  editor.chain().focus().setColor(c.color).run();
                } else {
                  editor.chain().focus().unsetColor().run();
                }
                setOpen(false);
              }}
            >
              {!c.color && (
                <span className="absolute inset-0 flex items-center justify-center text-surface text-[9px] font-bold">A</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FontSizeButton({ editor }: { editor: ReturnType<typeof useEditor> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!editor) return null;

  const activeFontSize = editor.getAttributes("textStyle")?.fontSize || "";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`bubble-btn${activeFontSize ? " active" : ""}`}
        title="Font size"
      >
        <Type className="w-4 h-4" />
      </button>
      {open && (
        <div className="font-size-picker">
          {FONT_SIZES.map((f) => (
            <button
              key={f.name}
              className={`font-size-option${activeFontSize === f.size || (!activeFontSize && !f.size) ? " active" : ""}`}
              onClick={() => {
                if (f.size) {
                  editor.chain().focus().setFontSize(f.size).run();
                } else {
                  editor.chain().focus().unsetFontSize().run();
                }
                setOpen(false);
              }}
            >
              <span style={f.size ? { fontSize: f.size } : {}}>{f.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditorProps {
  filename: string;
  initialMarkdown: string;
  onSave: (markdown: string) => void;
  spaceSlug?: string;
  category?: string;
  onTagClick?: (tag: string) => void;
  editable?: boolean;
}

export default function Editor({ filename, initialMarkdown, onSave, spaceSlug, category, onTagClick, editable = true }: EditorProps) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.extend({
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockNodeView);
        },
      }).configure({
        lowlight,
      }),
      Image,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      TaskList,
      TaskItem.configure({ nested: true }),
      Underline,
      Highlight.configure({ multicolor: true }),
      Superscript,
      Subscript,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-accent underline" } }),
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TagLink,
      TagSuggestion,
      SlashCommands,
      CalloutExtension,
      DragHandle,
      ExcalidrawExtension,
      DrawioExtension,
      CollapsibleList,
    ],
    content: "",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (isLoadingRef.current) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        const html = editor.getHTML();
        const md = turndown.turndown(html);
        onSave(md);
      }, 1000);
    },
  });

  // Toggle editable when prop changes
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  // Load markdown content
  useEffect(() => {
    if (!editor) return;
    isLoadingRef.current = true;
    const html = marked.parse(initialMarkdown, { async: false }) as string;
    editor.commands.setContent(html);
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 100);
  }, [editor, initialMarkdown, filename]);

  // Wire up tag click handler
  useEffect(() => {
    setTagClickHandler(onTagClick || null);
    return () => setTagClickHandler(null);
  }, [onTagClick]);

  // Fetch tags and pass to TagSuggestion extension
  useEffect(() => {
    if (!editor || !spaceSlug) return;
    fetch(`/api/spaces/${spaceSlug}/tags`)
      .then((r) => r.json())
      .then((tagsIndex) => {
        const tagNames = Object.keys(tagsIndex);
        editor.commands.updateTagData(tagNames);
      })
      .catch(() => {});
  }, [editor, spaceSlug]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previous = editor.getAttributes("link").href;
    const url = window.prompt("URL:", previous || "https://");
    if (url === null) return;
    if (url === "") { editor.chain().focus().extendMarkRange("link").unsetLink().run(); return; }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className={`flex-1 overflow-auto bg-surface${!editable ? " read-mode" : ""}`}>
      {editable && <BubbleMenu
        editor={editor}
        options={{ placement: "top", offset: 8 }}
        shouldShow={({ editor, state }) => {
          const { from, to } = state.selection;
          if (from === to) return false;
          if (editor.isActive("codeBlock")) return false;
          return true;
        }}
      >
        <div className="bubble-menu">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`bubble-btn${editor.isActive("bold") ? " active" : ""}`}
            title="Bold"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`bubble-btn${editor.isActive("italic") ? " active" : ""}`}
            title="Italic"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={`bubble-btn${editor.isActive("underline") ? " active" : ""}`}
            title="Underline"
          >
            <UnderlineIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleStrike().run()}
            className={`bubble-btn${editor.isActive("strike") ? " active" : ""}`}
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>

          <div className="bubble-sep" />

          <button
            onClick={() => editor.chain().focus().toggleCode().run()}
            className={`bubble-btn${editor.isActive("code") ? " active" : ""}`}
            title="Inline code"
          >
            <Code className="w-4 h-4" />
          </button>
          <button
            onClick={setLink}
            className={`bubble-btn${editor.isActive("link") ? " active" : ""}`}
            title="Link"
          >
            <LinkIcon className="w-4 h-4" />
          </button>

          <div className="bubble-sep" />

          <TextColorButton editor={editor} />
          <HighlightColorButton editor={editor} />
          <FontSizeButton editor={editor} />

          <div className="bubble-sep" />

          <button
            onClick={() => editor.chain().focus().toggleSuperscript().run()}
            className={`bubble-btn${editor.isActive("superscript") ? " active" : ""}`}
            title="Superscript"
          >
            <SuperscriptIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleSubscript().run()}
            className={`bubble-btn${editor.isActive("subscript") ? " active" : ""}`}
            title="Subscript"
          >
            <SubscriptIcon className="w-4 h-4" />
          </button>

          <div className="bubble-sep" />

          <button
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
            className={`bubble-btn${editor.isActive({ textAlign: "left" }) ? " active" : ""}`}
            title="Align left"
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
            className={`bubble-btn${editor.isActive({ textAlign: "center" }) ? " active" : ""}`}
            title="Align center"
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
            className={`bubble-btn${editor.isActive({ textAlign: "right" }) ? " active" : ""}`}
            title="Align right"
          >
            <AlignRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
            className={`bubble-btn${editor.isActive({ textAlign: "justify" }) ? " active" : ""}`}
            title="Justify"
          >
            <AlignJustify className="w-4 h-4" />
          </button>

          <div className="bubble-sep" />

          <button
            onClick={() => {
              editor.chain().focus().unsetAllMarks().run();
              editor.chain().focus().setTextAlign("left").run();
            }}
            className="bubble-btn"
            title="Clear formatting"
          >
            <Eraser className="w-4 h-4" />
          </button>
        </div>
      </BubbleMenu>}
      <div className="max-w-4xl mx-auto py-8 px-4">
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>
    </div>
  );
}
