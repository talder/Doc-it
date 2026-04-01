"use client";

import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import { ResizableImage } from "./extensions/ResizableImage";
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
import powershell from "highlight.js/lib/languages/powershell";
import { useEffect, useRef, useCallback, useState } from "react";
import { marked, type MarkedExtension } from "marked";
import TurndownService from "turndown";
import { createPortal } from "react-dom";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Link as LinkIcon, Superscript as SuperscriptIcon, Subscript as SubscriptIcon,
  Highlighter, Eraser, Palette, Type,
  AlignLeft, AlignCenter, AlignRight, AlignJustify,
  ExternalLink, Copy, Pencil, Trash2, Globe, Loader2, X,
  Heading1, Heading2, Heading3,
} from "lucide-react";

import Mathematics from "@tiptap/extension-mathematics";
import "katex/dist/katex.min.css";
import { SlashCommands } from "./extensions/SlashCommands";
import { CalloutExtension } from "./extensions/CalloutExtension";
import { CodeBlockNodeView } from "./extensions/CodeBlockNodeView";
import { DragHandle } from "./extensions/DragHandle";
import { ExcalidrawExtension } from "./extensions/ExcalidrawExtension";
import { DrawioExtension } from "./extensions/DrawioExtension";
import { FontSize } from "./extensions/FontSize";
import { TagLink, setTagClickHandler, setTagColorMap } from "./extensions/TagLink";
import { TagSuggestion } from "./extensions/TagSuggestion";
import { MentionNode, MentionSuggestion } from "./extensions/MentionSuggestion";
import { CollapsibleBlock } from "./extensions/CollapsibleBlock";
import { LinkedDocExtension, setLinkedDocClickHandler } from "./extensions/LinkedDocExtension";
import type { LinkedDocAttrs } from "./extensions/LinkedDocExtension";
import { AttachmentExtension } from "./extensions/AttachmentExtension";
import type { AttachmentAttrs } from "./extensions/AttachmentExtension";
import { PDFEmbedExtension } from "./extensions/PDFEmbedExtension";
import type { PDFEmbedAttrs } from "./extensions/PDFEmbedExtension";
import { TemplatePlaceholderExtension } from "./extensions/TemplatePlaceholderExtension";
import { EmojiShortcodeExtension } from "./extensions/EmojiShortcodeExtension";
import { EnhancedTableBlockExtension } from "./extensions/EnhancedTableBlockExtension";
import { TableOfContentsExtension } from "./extensions/TableOfContentsExtension";
import type { EnhancedTableBlockAttrs } from "./extensions/EnhancedTableBlockExtension";
import { Extension } from "@tiptap/core";
import { Plugin as PmPlugin, PluginKey as PmPluginKey, NodeSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { columnResizing, tableEditing } from "@tiptap/pm/tables";
import { isNodeEmpty } from "@tiptap/core";
import Picker from "@emoji-mart/react";
// @ts-ignore
import emojiPickerData from "@emoji-mart/data";
import { toSafeB64, fromSafeB64 } from "@/lib/base64";
import type { TplField, DocFile } from "@/lib/types";
import TemplateFieldModal from "@/components/modals/TemplateFieldModal";
import DatabaseCreateModal from "@/components/modals/EnhancedTableCreateModal";
import { Search, FileText as FileTextIcon, Database as DatabaseIcon } from "lucide-react";
import UrlInputModal from "@/components/modals/UrlInputModal";
import MathEditorModal from "@/components/modals/MathEditorModal";

// ── Database picker (insert existing DB into doc) ────────────────────────────
function DatabasePicker({
  spaceSlug,
  onSelect,
  onClose,
}: {
  spaceSlug: string;
  onSelect: (db: { id: string; title: string; viewId: string }) => void;
  onClose: () => void;
}) {
  const [dbs, setDbs] = useState<{ id: string; title: string; views?: { id: string }[] }[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables`)
      .then((r) => r.json())
      .then(setDbs)
      .catch(() => {});
  }, [spaceSlug]);

  const filtered = dbs.filter((db) => db.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
          <input
            autoFocus
            className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted"
            placeholder="Search enhanced tables…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 && (
            <div className="px-2 py-6 text-center text-sm text-text-muted">
              {dbs.length === 0 ? "No enhanced tables yet" : "No enhanced tables found"}
            </div>
          )}
          {filtered.map((db) => (
            <button
              key={db.id}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left transition-colors"
              onClick={() => onSelect({ id: db.id, title: db.title, viewId: db.views?.[0]?.id || "" })}
            >
              <DatabaseIcon className="w-4 h-4 flex-shrink-0" style={{ color: "#14b8a6" }} />
              <span className="font-medium text-sm text-text-primary truncate">{db.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const lowlight = createLowlight(common);
lowlight.register("powershell", powershell);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB


// ── Table cell color palette ─────────────────────────────────────────────
const TABLE_CELL_COLORS: (string | null)[] = [
  null, "#f8fafc", "#e2e8f0", "#dbeafe", "#dcfce7",
  "#fef9c3", "#fee2e2", "#f3e8ff", "#ffedd5", "#cffafe",
  "#fce7f3", "#1e3a5f", "#14532d",
];

// ── Custom table extensions (cell background color + striped rows) ────────
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-cell-bg") || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            "data-cell-bg": attributes.backgroundColor as string,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      backgroundColor: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-cell-bg") || null,
        renderHTML: (attributes) => {
          if (!attributes.backgroundColor) return {};
          return {
            "data-cell-bg": attributes.backgroundColor as string,
            style: `background-color: ${attributes.backgroundColor}`,
          };
        },
      },
    };
  },
});

const CustomTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      striped: {
        default: false,
        parseHTML: (element) => element.classList.contains("table-striped"),
        renderHTML: (attributes) => {
          if (!attributes.striped) return {};
          return { class: "table-striped" };
        },
      },
    };
  },
  // Override to skip the `isEditable` guard in the base extension — otherwise
  // columnResizing is never registered when the editor starts in read-only mode.
  addProseMirrorPlugins() {
    const isResizable = this.options.resizable;
    return [
      ...(isResizable
        ? [
            columnResizing({
              handleWidth: this.options.handleWidth,
              cellMinWidth: this.options.cellMinWidth,
              defaultCellMinWidth: this.options.cellMinWidth,
              View: this.options.View,
              lastColumnResizable: this.options.lastColumnResizable,
            }),
          ]
        : []),
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      }),
    ];
  },
}).configure({ resizable: true });

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
      // Helper: replace an HTML-comment embed pattern within a (possibly merged) HTML block.
      // marked may combine adjacent HTML elements into one block, so we cannot rely on ^…$ anchors.
      const replaceComment = (
        src: string,
        re: RegExp,
        build: (m: RegExpMatchArray) => string | null,
      ): string | null => {
        const m = src.match(re);
        if (!m) return null;
        const html = build(m);
        if (html === null) return null;
        return src.replace(m[0], html);
      };

      let out = text;

      // excalidraw: <!-- excalidraw:drawing-id -->
      out = replaceComment(out, /<!--\s*excalidraw:([\w-]+)\s*-->/, (m) =>
        `<div data-excalidraw="" data-drawing-id="${m[1]}">[Excalidraw Drawing]</div>`,
      ) ?? out;

      // drawio with SVG: <!-- drawio:{b64-xml}|{b64-svg} -->  (check BEFORE plain drawio)
      out = replaceComment(out, /<!--\s*drawio:([A-Za-z0-9+/=]+)\|([A-Za-z0-9+/=]+)\s*-->/, (m) => {
        try {
          const xml = atob(m[1]); const svg = atob(m[2]);
          return `<div data-drawio="" data-drawio-data="${xml.replace(/"/g, '&quot;')}" data-drawio-svg="${svg.replace(/"/g, '&quot;')}">[Draw.io Diagram]</div>`;
        } catch { return null; }
      }) ?? out;

      // drawio: <!-- drawio:{b64-xml} -->
      out = replaceComment(out, /<!--\s*drawio:([A-Za-z0-9+/=]+)\s*-->/, (m) => {
        try {
          const xml = atob(m[1]);
          return `<div data-drawio="" data-drawio-data="${xml.replace(/"/g, '&quot;')}">[Draw.io Diagram]</div>`;
        } catch { return null; }
      }) ?? out;

      // linked-doc
      out = replaceComment(out, /<!--\s*linked-doc:([A-Za-z0-9+/=]+)\s*-->/, (m) => {
        try {
          const a = JSON.parse(atob(m[1]));
          const anchorAttr = a.anchor ? ` data-anchor="${a.anchor}"` : "";
          return `<div data-linked-doc="" data-doc-name="${a.docName}" data-doc-category="${a.docCategory}" data-view-mode="${a.viewMode || 'card'}" data-space-slug="${a.spaceSlug}"${anchorAttr}></div>`;
        } catch { return null; }
      }) ?? out;

      // attachment
      out = replaceComment(out, /<!--\s*attachment:([A-Za-z0-9+/=]+)\s*-->/, (m) => {
        try {
          const a = JSON.parse(atob(m[1]));
          return `<div data-attachment="" data-filename="${a.filename}" data-original-name="${a.originalName}" data-mime-type="${a.mimeType}" data-size="${a.size}" data-category="${a.category}" data-space-slug="${a.spaceSlug}" data-url="${a.url}"></div>`;
        } catch { return null; }
      }) ?? out;

      // pdf-embed
      out = replaceComment(out, /<!--\s*pdf-embed:([A-Za-z0-9+/=]+)\s*-->/, (m) => {
        try {
          const a = JSON.parse(atob(m[1]));
          return `<div data-pdf-embed="" data-filename="${a.filename}" data-original-name="${a.originalName}" data-category="${a.category}" data-space-slug="${a.spaceSlug}" data-url="${a.url}"></div>`;
        } catch { return null; }
      }) ?? out;

      // database block
      out = replaceComment(out, /<!--\s*database:([A-Za-z0-9+/=]+)\s*-->/, (m) => {
        try {
          const a = JSON.parse(atob(m[1]));
          return `<div data-database-block="" data-db-id="${a.dbId}" data-view-id="${a.viewId || ""}" data-space-slug="${a.spaceSlug}"></div>`;
        } catch { return null; }
      }) ?? out;

      // table of contents
      out = replaceComment(out, /<!--\s*toc(?::(numbered))?\s*-->/, (m) =>
        `<div data-type="tableOfContents" data-show-numbering="${m[1] === "numbered" ? "true" : "false"}">Table of Contents</div>`,
      ) ?? out;

      return out;
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

// Preserve table HTML as-is (keeps cell colors, striped class, etc.)
turndown.keep(["table"]);

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

// Turndown rules for new embedded nodes
turndown.addRule("linkedDoc", {
  filter: (node) => node.nodeName === "DIV" && node.hasAttribute("data-linked-doc"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const anchor = el.getAttribute("data-anchor") || "";
    const attrs: Record<string, string> = {
      docName:     el.getAttribute("data-doc-name")     || "",
      docCategory: el.getAttribute("data-doc-category") || "",
      viewMode:    el.getAttribute("data-view-mode")    || "card",
      spaceSlug:   el.getAttribute("data-space-slug")   || "",
    };
    if (anchor) attrs.anchor = anchor;
    return `\n<!-- linked-doc:${btoa(JSON.stringify(attrs))} -->\n\n`;
  },
});
turndown.addRule("attachment", {
  filter: (node) => node.nodeName === "DIV" && node.hasAttribute("data-attachment"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const attrs = {
      filename:     el.getAttribute("data-filename")      || "",
      originalName: el.getAttribute("data-original-name") || "",
      mimeType:     el.getAttribute("data-mime-type")     || "",
      size:         parseInt(el.getAttribute("data-size") || "0", 10),
      category:     el.getAttribute("data-category")      || "",
      spaceSlug:    el.getAttribute("data-space-slug")    || "",
      url:          el.getAttribute("data-url")           || "",
    };
    return `\n<!-- attachment:${btoa(JSON.stringify(attrs))} -->\n\n`;
  },
});
turndown.addRule("pdfEmbed", {
  filter: (node) => node.nodeName === "DIV" && node.hasAttribute("data-pdf-embed"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const attrs = {
      filename:     el.getAttribute("data-filename")      || "",
      originalName: el.getAttribute("data-original-name") || "",
      category:     el.getAttribute("data-category")      || "",
      spaceSlug:    el.getAttribute("data-space-slug")    || "",
      url:          el.getAttribute("data-url")           || "",
    };
    return `\n<!-- pdf-embed:${btoa(JSON.stringify(attrs))} -->\n\n`;
  },
});
turndown.addRule("databaseBlock", {
  filter: (node) => node.nodeName === "DIV" && node.hasAttribute("data-database-block"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const attrs = {
      dbId:      el.getAttribute("data-db-id")       || "",
      viewId:    el.getAttribute("data-view-id")     || "",
      spaceSlug: el.getAttribute("data-space-slug")  || "",
    };
    return `\n<!-- database:${btoa(JSON.stringify(attrs))} -->\n\n`;
  },
});
// Table of contents block → markdown comment
turndown.addRule("tableOfContents", {
  filter: (node) => {
    return (
      node.nodeName === "DIV" &&
      (node as HTMLElement).getAttribute("data-type") === "tableOfContents"
    );
  },
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const numbered = el.getAttribute("data-show-numbering") === "true";
    return `\n<!-- toc${numbered ? ":numbered" : ""} -->\n\n`;
  },
});
// Preserve template placeholder spans
turndown.addRule("templatePlaceholder", {
  filter: (node) => node.nodeName === "SPAN" && !!(node as HTMLElement).getAttribute("data-tpl-field"),
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const b64 = el.getAttribute("data-tpl-field") || "";
    let name = "field";
    try { name = (fromSafeB64(b64) as TplField).name; } catch {}
    return `<span data-tpl-field="${b64}">[${name}]</span>`;
  },
});

// Preserve image width — emit <img> HTML when width is set, else standard markdown
turndown.addRule("resizableImage", {
  filter: (node) => node.nodeName === "IMG",
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const src = el.getAttribute("src") || "";
    const alt = el.getAttribute("alt") || "";
    const w = el.getAttribute("width");
    const style = el.getAttribute("style");
    if (w) {
      const styleAttr = style ? ` style="${style}"` : "";
      return `\n<img src="${src}" alt="${alt}" width="${w}"${styleAttr} />\n`;
    }
    return `\n![${alt}](${src})\n`;
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

/** Extract heading texts from markdown source */
function extractHeadings(md: string): string[] {
  return [...md.matchAll(/^#{1,6}\s+(.+)$/gm)]
    .map((m) => m[1].trim().replace(/[*_`[\]]/g, ""));
}

// ─── Doc Picker Dialog ────────────────────────────────────────────────────
function DocPickerDialog({
  spaceSlug,
  editor,
  onClose,
}: {
  spaceSlug: string;
  editor: any;
  onClose: () => void;
}) {
  const [docs, setDocs] = useState<DocFile[]>([]);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<"pick-doc" | "pick-anchor">("pick-doc");
  const [selectedDoc, setSelectedDoc] = useState<DocFile | null>(null);
  const [headings, setHeadings] = useState<string[]>([]);
  const [customAnchor, setCustomAnchor] = useState("");

  useEffect(() => {
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/docs`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setDocs)
      .catch(() => {});
  }, [spaceSlug]);

  const filtered = docs.filter(
    (d) =>
      d.name.toLowerCase().includes(query.toLowerCase()) ||
      d.category.toLowerCase().includes(query.toLowerCase())
  );

  const pickDoc = (doc: DocFile) => {
    setSelectedDoc(doc);
    setStep("pick-anchor");
    setHeadings([]);
    setCustomAnchor("");
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/docs/${encodeURIComponent(doc.name)}?category=${encodeURIComponent(doc.category)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data?.content) setHeadings(extractHeadings(data.content)); })
      .catch(() => {});
  };

  const insertDoc = (anchor?: string) => {
    if (!selectedDoc) return;
    editor?.commands.insertLinkedDoc({
      docName: selectedDoc.name,
      docCategory: selectedDoc.category,
      viewMode: "card",
      spaceSlug,
      anchor: anchor?.trim() || "",
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-xl shadow-xl border border-border w-full max-w-md p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {step === "pick-doc" ? (
          <>
            <div className="flex items-center gap-2 mb-3 border-b border-border pb-3">
              <Search className="w-4 h-4 text-text-muted flex-shrink-0" />
              <input
                autoFocus
                className="flex-1 bg-transparent outline-none text-sm text-text-primary placeholder:text-text-muted"
                placeholder="Search documents…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="max-h-72 overflow-y-auto space-y-0.5">
              {filtered.length === 0 && (
                <div className="px-2 py-6 text-center text-sm text-text-muted">No documents found</div>
              )}
              {filtered.map((doc) => (
                <button
                  key={`${doc.category}/${doc.name}`}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted text-left transition-colors"
                  onClick={() => pickDoc(doc)}
                >
                  <FileTextIcon className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="font-medium text-sm text-text-primary flex-1">{doc.name}</span>
                  <span className="text-xs text-text-muted">{doc.category}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3 border-b border-border pb-3">
              <button
                className="p-1 rounded hover:bg-muted text-text-muted"
                onClick={() => setStep("pick-doc")}
                title="Back"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="m12 5-7 7 7 7"/></svg>
              </button>
              <span className="text-sm font-medium text-text-primary truncate flex-1">
                Link to section in &ldquo;{selectedDoc?.name}&rdquo;
              </span>
            </div>
            <button
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted text-sm text-text-muted italic mb-1 transition-colors"
              onClick={() => insertDoc()}
            >
              Link to document (no specific section)
            </button>
            {headings.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-0.5 border-t border-border pt-2 mt-1">
                {headings.map((h, i) => (
                  <button
                    key={i}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                    onClick={() => insertDoc(h)}
                  >
                    <span className="text-xs text-red-500 font-bold">§</span>
                    <span className="text-sm text-text-primary">{h}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-3 flex gap-2 border-t border-border pt-3">
              <input
                className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-surface-alt outline-none focus:border-accent placeholder:text-text-muted"
                placeholder="Or type a custom heading…"
                value={customAnchor}
                onChange={(e) => setCustomAnchor(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && customAnchor.trim()) insertDoc(customAnchor); }}
              />
              <button
                className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                disabled={!customAnchor.trim()}
                onClick={() => insertDoc(customAnchor)}
              >
                Link
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type PageWidth = "narrow" | "wide" | "max";

const PAGE_WIDTH_MAX: Record<PageWidth, string | undefined> = {
  narrow: "896px",
  wide: "1344px",
  max: undefined,
};

interface EditorProps {
  filename: string;
  initialMarkdown: string;
  onSave: (markdown: string) => void;
  spaceSlug?: string;
  category?: string;
  onTagClick?: (tag: string) => void;
  editable?: boolean;
  lineSpacing?: "compact" | "spaced";
  isTemplate?: boolean;
  pageWidth?: PageWidth;
  onPageWidthChange?: (w: PageWidth) => void;
  spellcheckEnabled?: boolean;
  spellcheckLanguage?: string;
  spaceMembers?: { username: string; fullName?: string }[];
  tagColors?: Record<string, string>;
}

export default function Editor({ filename, initialMarkdown, onSave, spaceSlug, category, onTagClick, editable = true, lineSpacing = "compact", isTemplate = false, pageWidth = "narrow", onPageWidthChange, spellcheckEnabled = false, spellcheckLanguage = "en", spaceMembers = [], tagColors = {} }: EditorProps) {
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLoadingRef = useRef(false);
  const pendingSaveFnRef = useRef<null | (() => void)>(null);
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  // ── Flush any pending debounced save on unmount ────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current && pendingSaveFnRef.current) {
        clearTimeout(saveTimeoutRef.current);
        try { pendingSaveFnRef.current(); } catch {}
      }
    };
  }, []); // empty deps — uses refs only, intentionally captures nothing

  // ── Slash command dialog / upload state ──────────────────────────────────────
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [pendingSlashEditor, setPendingSlashEditor] = useState<any>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Duplicate file detected — wait for user to choose a name
  const [pendingDuplicate, setPendingDuplicate] = useState<{
    sha256: string; existingNames: string[];
    file: File; isPdf: boolean; size: number; mimeType: string;
  } | null>(null);

  // ── URL input modal state (link + image) ──────────────────────────────────────
  const [urlModal, setUrlModal] = useState<{
    open: boolean;
    mode: "link" | "image";
    context: "slash" | "bubble";  // slash = insert url as text; bubble = apply to selection
    initialValue: string;
    initialOpenInNewTab: boolean;
    targetEditor: any;
  }>({ open: false, mode: "link", context: "slash", initialValue: "", initialOpenInNewTab: false, targetEditor: null });

  // ── Link copy-URL feedback state ──────────────────────────────────────────
  const [linkCopied, setLinkCopied] = useState(false);

  // ── Emoji picker state ────────────────────────────────────────────────────
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiPickerPos, setEmojiPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingEmojiEditor, setPendingEmojiEditor] = useState<any>(null);

  // ── Color picker state ────────────────────────────────────────────────────
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [colorPickerPos, setColorPickerPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingColorEditor, setPendingColorEditor] = useState<any>(null);
  const [colorPickerValue, setColorPickerValue] = useState("#3B82F6");
  const [colorPickerFormat, setColorPickerFormat] = useState<"hex" | "rgb">("hex");
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // ── Color format helpers ──────────────────────────────────────────────────
  const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
    const m = hex.match(/^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/);
    if (!m) return null;
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  };
  const rgbToHex = (r: number, g: number, b: number): string =>
    "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
  const colorDisplayValue = (): string => {
    if (colorPickerFormat === "hex") return colorPickerValue.toUpperCase();
    const rgb = hexToRgb(colorPickerValue);
    if (!rgb) return colorPickerValue.toUpperCase();
    return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  };

  // ── Math editor state ───────────────────────────────────────────────────────
  const [mathEditorOpen, setMathEditorOpen] = useState(false);
  const [mathEditorInitial, setMathEditorInitial] = useState("");
  const [mathEditorPos, setMathEditorPos] = useState<number | null>(null);
  const [pendingMathEditor, setPendingMathEditor] = useState<any>(null);

  // ── Database create modal state ──────────────────────────────────────────
  const [showDatabaseCreateModal, setShowDatabaseCreateModal] = useState(false);
  const [pendingDatabaseEditor, setPendingDatabaseEditor] = useState<any>(null);
  const [showDbPicker, setShowDbPicker] = useState(false);
  const [pendingDbPickerEditor, setPendingDbPickerEditor] = useState<any>(null);

  // ── Template field insertion / edit state ──────────────────────────────────
  const [tplFieldModalOpen, setTplFieldModalOpen] = useState(false);
  const [pendingTplEditor, setPendingTplEditor]   = useState<any>(null);
  const [tplEditPos,     setTplEditPos]           = useState<number | null>(null);
  const [tplEditInitial, setTplEditInitial]       = useState<Partial<TplField> | undefined>();

  // ── Link hover preview ────────────────────────────────────────────────────────
  const ogCacheRef = useRef<Map<string, { title?: string; description?: string; image?: string; favicon?: string }>>(new Map());
  const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const [linkHover, setLinkHover] = useState<{
    href: string;
    rect: DOMRect;
    data: { title?: string; description?: string; image?: string; favicon?: string } | null;
    loading: boolean;
  } | null>(null);

  const [linkHoverFavErr, setLinkHoverFavErr] = useState(false);
  const [linkHoverImgErr, setLinkHoverImgErr] = useState(false);

  // ── Table toolbar state ───────────────────────────────────────────
  const [tableToolbar, setTableToolbar] = useState<{ tableRect: DOMRect; striped: boolean; columns: DOMRect[] } | null>(null);
  const [activeColMenu, setActiveColMenu] = useState<number | null>(null);
  const [tableOptionsOpen, setTableOptionsOpen] = useState(false);
  const tableOverlayRef = useRef<HTMLDivElement>(null);
  const tableColumnCellsRef = useRef<HTMLElement[]>([]);

  // ── Bubble menu z-index refs ──────────────────────────────────────
  // BubbleMenu's ref resolves to menuEl.current (the outer positioning div).
  // We must set z-index via JS because the CSS :has() selector is stripped
  // by lightningcss/Tailwind v4 before it can match these dynamic elements.
  const bubbleMenuElRef = useRef<HTMLDivElement>(null);
  const tableCellMenuElRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      CodeBlockLowlight.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            theme: {
              default:
                typeof window !== "undefined"
                  ? (localStorage.getItem("codeblock-theme") ?? "dark")
                  : "dark",
              parseHTML: (element: HTMLElement) =>
                element.getAttribute("data-cb-theme") ?? null,
              renderHTML: (attributes: Record<string, unknown>) => {
                if (!attributes.theme) return {};
                return { "data-cb-theme": attributes.theme };
              },
            },
          };
        },
        addNodeView() {
          return ReactNodeViewRenderer(CodeBlockNodeView);
        },
      }).configure({
        lowlight,
      }),
      ResizableImage,
      CustomTable,
      TableRow,
      CustomTableCell,
      CustomTableHeader,
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
      Mathematics.configure({
        inlineOptions: {
          onClick: (node: any, pos: number) => {
            setMathEditorInitial(node.attrs.latex || "");
            setMathEditorPos(pos);
            setPendingMathEditor(null);
            setMathEditorOpen(true);
          },
        },
      }),
      TagLink,
      TagSuggestion,
      SlashCommands,
      CalloutExtension,
      DragHandle,
      ExcalidrawExtension,
      DrawioExtension,
      CollapsibleBlock,
      LinkedDocExtension,
      AttachmentExtension,
      PDFEmbedExtension,
      TemplatePlaceholderExtension,
      EmojiShortcodeExtension,
      MentionNode,
      MentionSuggestion,
      EnhancedTableBlockExtension,
      TableOfContentsExtension,
      Extension.create({
        name: "tabHandler",
        addKeyboardShortcuts() {
          return {
            Tab: () => {
              // In a list → indent
              if (this.editor.can().sinkListItem("listItem")) {
                return this.editor.commands.sinkListItem("listItem");
              }
              if (this.editor.can().sinkListItem("taskItem")) {
                return this.editor.commands.sinkListItem("taskItem");
              }
              // Otherwise insert a tab character
              return this.editor.commands.insertContent("\t");
            },
            "Shift-Tab": () => {
              // In a list → outdent
              if (this.editor.can().liftListItem("listItem")) {
                return this.editor.commands.liftListItem("listItem");
              }
              if (this.editor.can().liftListItem("taskItem")) {
                return this.editor.commands.liftListItem("taskItem");
              }
              return true; // consume the event
            },
          };
        },
      }),
      Extension.create({
        name: "inlinePlaceholder",
        addProseMirrorPlugins() {
          const placeholderText = "Type / for commands";
          return [
            new PmPlugin({
              key: new PmPluginKey("inlinePlaceholder"),
              props: {
                decorations: ({ doc, selection }) => {
                  if (!this.editor.isEditable) return null;
                  const { anchor } = selection;
                  const decorations: Decoration[] = [];
                  doc.descendants((node, pos) => {
                    const hasAnchor = anchor >= pos && anchor <= pos + node.nodeSize;
                    if (hasAnchor && !node.isLeaf && isNodeEmpty(node)) {
                      decorations.push(
                        Decoration.node(pos, pos + node.nodeSize, {
                          class: "is-empty",
                          "data-placeholder": placeholderText,
                        })
                      );
                    }
                    return false; // only top-level children
                  });
                  return DecorationSet.create(doc, decorations);
                },
              },
            }),
          ];
        },
      }),
    ],
    content: "",
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (isLoadingRef.current) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      // Capture the current save handler so the debounced save targets the
      // correct document even if the user switches docs before it fires.
      const capturedSave = onSaveRef.current;
      const doSave = () => {
        try {
          const html = editor.getHTML();
          const md = turndown.turndown(html);
          capturedSave(md);
        } catch {}
        pendingSaveFnRef.current = null;
      };
      pendingSaveFnRef.current = doSave;
      saveTimeoutRef.current = setTimeout(doSave, 10000);
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
    // Flush any pending debounced save for the PREVIOUS document before
    // replacing the editor content. The pending doSave closure captured the
    // old save handler and the editor still holds the old content, so the
    // flush correctly saves the previous document.
    if (saveTimeoutRef.current && pendingSaveFnRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
      try { pendingSaveFnRef.current(); } catch {}
      pendingSaveFnRef.current = null;
    }
    isLoadingRef.current = true;
    const html = marked.parse(initialMarkdown, { async: false }) as string;
    // TipTap's setContent internally calls flushSync which logs a warning
    // when called from useEffect. This is harmless — deferring with setTimeout
    // causes the editor to briefly render empty content, which is worse.
    editor.commands.setContent(html);
    // Reset scroll to top after TipTap's internal scrollIntoView runs
    requestAnimationFrame(() => {
      if (editorWrapRef.current) editorWrapRef.current.scrollTop = 0;
    });
    setTimeout(() => {
      isLoadingRef.current = false;
    }, 100);
  }, [editor, initialMarkdown, filename]);

  // Wire up tag click handler
  useEffect(() => {
    setTagClickHandler(onTagClick || null);
    return () => setTagClickHandler(null);
  }, [onTagClick]);

  // Wire up tag color map for inline chip colors
  useEffect(() => {
    setTagColorMap(tagColors);
  }, [tagColors]);

  // ── Slash custom-event handlers ( /attachment, /pdf, /linked-doc ) ──────────────
  useEffect(() => {
    const handleLinkedDoc = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingSlashEditor(ev.detail.editor);
      setShowDocPicker(true);
    };
    const handleAttachment = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingSlashEditor(ev.detail.editor);
      setTimeout(() => attachmentInputRef.current?.click(), 50);
    };
    const handlePdf = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingSlashEditor(ev.detail.editor);
      setTimeout(() => pdfInputRef.current?.click(), 50);
    };
    const handleLink = (e: Event) => {
      const ev = e as CustomEvent;
      setUrlModal({ open: true, mode: "link", context: "slash", initialValue: "", initialOpenInNewTab: false, targetEditor: ev.detail.editor });
    };
    const handleEmoji = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingEmojiEditor(ev.detail.editor);
      const coords = ev.detail.coords as { left: number; bottom: number };
      // Clamp so picker stays on screen (picker is ~355px wide, ~435px tall)
      const x = typeof window !== "undefined"
        ? Math.min(coords.left, window.innerWidth - 380)
        : coords.left;
      const y = typeof window !== "undefined" && coords.bottom + 450 > window.innerHeight
        ? Math.max(4, coords.bottom - 460)
        : coords.bottom + 8;
      setEmojiPickerPos({ x, y });
      setShowEmojiPicker(true);
    };
    const handleImage = (e: Event) => {
      const ev = e as CustomEvent;
      setUrlModal({ open: true, mode: "image", context: "slash", initialValue: "", initialOpenInNewTab: false, targetEditor: ev.detail.editor });
    };
    const handleTemplateField = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingTplEditor(ev.detail.editor);
      setTplEditPos(null);
      setTplEditInitial(undefined);
      setTplFieldModalOpen(true);
    };
    const handleTplEditField = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingTplEditor(ev.detail.editor);
      setTplEditPos(ev.detail.pos as number);
      setTplEditInitial(ev.detail.field as TplField);
      setTplFieldModalOpen(true);
    };
    const handleMath = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingMathEditor(ev.detail.editor);
      setMathEditorInitial("");
      setMathEditorPos(null);
      setMathEditorOpen(true);
    };
    const handleDatabase = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingDatabaseEditor(ev.detail.editor);
      setShowDatabaseCreateModal(true);
    };
    const handleDatabaseExisting = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingDbPickerEditor(ev.detail.editor);
      setShowDbPicker(true);
    };
    document.addEventListener("slash:math", handleMath);
    document.addEventListener("slash:database", handleDatabase);
    document.addEventListener("slash:database-existing", handleDatabaseExisting);
    document.addEventListener("tpl:edit-field", handleTplEditField);
    document.addEventListener("slash:template-field", handleTemplateField);
    document.addEventListener("slash:linked-doc", handleLinkedDoc);
    document.addEventListener("slash:attachment", handleAttachment);
    document.addEventListener("slash:pdf", handlePdf);
    document.addEventListener("slash:link", handleLink);
    document.addEventListener("slash:image", handleImage);
    const handleColor = (e: Event) => {
      const ev = e as CustomEvent;
      setPendingColorEditor(ev.detail.editor);
      const coords = ev.detail.coords as { left: number; bottom: number };
      const x = typeof window !== "undefined" ? Math.min(coords.left, window.innerWidth - 300) : coords.left;
      const y = typeof window !== "undefined" && coords.bottom + 280 > window.innerHeight ? Math.max(4, coords.bottom - 290) : coords.bottom + 8;
      setColorPickerPos({ x, y });
      setShowColorPicker(true);
    };
    document.addEventListener("slash:color", handleColor);
    document.addEventListener("slash:emoji", handleEmoji);
    return () => {
      document.removeEventListener("slash:color", handleColor);
      document.removeEventListener("slash:math", handleMath);
      document.removeEventListener("slash:database", handleDatabase);
      document.removeEventListener("slash:database-existing", handleDatabaseExisting);
      document.removeEventListener("tpl:edit-field", handleTplEditField);
      document.removeEventListener("slash:template-field", handleTemplateField);
      document.removeEventListener("slash:linked-doc", handleLinkedDoc);
      document.removeEventListener("slash:attachment", handleAttachment);
      document.removeEventListener("slash:pdf", handlePdf);
      document.removeEventListener("slash:link", handleLink);
      document.removeEventListener("slash:image", handleImage);
      document.removeEventListener("slash:emoji", handleEmoji);
    };
  }, []);

  // ── Linked-doc navigation handler ─────────────────────────────────────
  useEffect(() => {
    setLinkedDocClickHandler((docName, docCategory, linkedSpaceSlug, anchor) => {
      document.dispatchEvent(
        new CustomEvent("navigate:doc", {
          detail: { docName, docCategory, spaceSlug: linkedSpaceSlug, anchor },
          bubbles: true,
        })
      );
    });
    return () => setLinkedDocClickHandler(null);
  }, []);

  // ── File upload handler ───────────────────────────────────────────────────
  const handleFileUpload = useCallback(
    async (file: File, isPdf: boolean) => {
      if (!spaceSlug) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        alert(`The file "${file.name}" exceeds the 50 MB upload limit and cannot be uploaded.`);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category || "General");
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(spaceSlug)}/attachments`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error || "Upload failed. Please try again.");
        return;
      }
      const data = await res.json();

      // Duplicate detected — hold file info and let user choose a name
      if (data.isDuplicate) {
        setPendingDuplicate({
          sha256: data.sha256,
          existingNames: data.existingNames,
          file,
          isPdf,
          size: file.size,
          mimeType: file.type || "",
        });
        return;
      }

      const target = pendingSlashEditor || editor;
      if (isPdf) {
        target?.commands.insertPDFEmbed({
          filename:     data.filename,
          originalName: data.originalName,
          category:     data.category,
          spaceSlug,
          url:          data.url,
        } as PDFEmbedAttrs);
      } else {
        target?.commands.insertAttachment({
          filename:     data.filename,
          originalName: data.originalName,
          mimeType:     data.mimeType,
          size:         data.size,
          category:     data.category,
          spaceSlug,
          url:          data.url,
        } as AttachmentAttrs);
      }
      setPendingSlashEditor(null);
    },
    [spaceSlug, category, pendingSlashEditor, editor]
  );

  // Confirm duplicate: POST chosen name, then insert node
  const confirmDuplicate = useCallback(async (chosenName: string) => {
    if (!pendingDuplicate || !spaceSlug) return;
    const { sha256, file, isPdf, size, mimeType } = pendingDuplicate;
    const cat = category || "General";
    setPendingDuplicate(null);
    try {
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(spaceSlug)}/attachments`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha256, chosenName, category: cat, size, mimeType }),
        }
      );
      if (!res.ok) { alert("Failed to confirm upload. Please try again."); return; }
      const data = await res.json();
      const target = pendingSlashEditor || editor;
      if (isPdf) {
        target?.commands.insertPDFEmbed({
          filename: data.filename, originalName: data.originalName,
          category: data.category, spaceSlug, url: data.url,
        } as PDFEmbedAttrs);
      } else {
        target?.commands.insertAttachment({
          filename: data.filename, originalName: data.originalName,
          mimeType: data.mimeType, size: data.size,
          category: data.category, spaceSlug, url: data.url,
        } as AttachmentAttrs);
      }
      setPendingSlashEditor(null);
    } catch { alert("Upload confirmation failed."); }
  }, [pendingDuplicate, spaceSlug, category, pendingSlashEditor, editor]);

  // ── Image upload handler (for UrlInputModal upload tab) ─────────────────
  const handleImageUpload = useCallback(
    async (file: File): Promise<string | null> => {
      if (!spaceSlug) return null;
      if (file.size > MAX_UPLOAD_BYTES) {
        alert(`The file "${file.name}" exceeds the 50 MB upload limit and cannot be uploaded.`);
        return null;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category || "General");
      const res = await fetch(
        `/api/spaces/${encodeURIComponent(spaceSlug)}/attachments`,
        { method: "POST", body: formData }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert((err as { error?: string }).error || "Upload failed. Please try again.");
        return null;
      }
      const data = await res.json();
      return data.url as string;
    },
    [spaceSlug, category]
  );

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

  // Pass space members to MentionSuggestion extension
  useEffect(() => {
    if (!editor || !spaceMembers.length) return;
    editor.commands.updateMemberData(spaceMembers);
  }, [editor, spaceMembers]);

  // ── Attach hover-preview listeners to editor wrapper ────────────────────────
  useEffect(() => {
    const wrap = editorWrapRef.current;
    if (!wrap) return;

    const showPreview = (anchor: HTMLAnchorElement) => {
      const href = anchor.href;
      if (!href || (!href.startsWith("http://") && !href.startsWith("https://"))) return;
      const rect = anchor.getBoundingClientRect();
      const cached = ogCacheRef.current.get(href);
      setLinkHoverFavErr(false);
      setLinkHoverImgErr(false);
      setLinkHover({ href, rect, data: cached ?? null, loading: !cached });
      if (!cached) {
        fetch(`/api/link-preview?url=${encodeURIComponent(href)}`)
          .then((r) => r.json())
          .then((data) => {
            ogCacheRef.current.set(href, data);
            setLinkHover((prev) =>
              prev?.href === href ? { ...prev, data, loading: false } : prev
            );
          })
          .catch(() =>
            setLinkHover((prev) =>
              prev?.href === href ? { ...prev, loading: false } : prev
            )
          );
      }
    };

    const onMouseOver = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
      showPreview(anchor);
    };

    const onMouseOut = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[href]");
      if (!anchor) return;
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest("[data-link-preview-card]")) return;
      hoverHideTimerRef.current = setTimeout(() => setLinkHover(null), 250);
    };

    wrap.addEventListener("mouseover", onMouseOver);
    wrap.addEventListener("mouseout", onMouseOut);
    return () => {
      wrap.removeEventListener("mouseover", onMouseOver);
      wrap.removeEventListener("mouseout", onMouseOut);
      if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
    };
  }, [editor]); // re-run when editor becomes available so editorWrapRef is populated

  // ── Table toolbar position tracking ────────────────────────────────────
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (!editor.isActive("tableCell") && !editor.isActive("tableHeader")) {
        setTableToolbar(null);
        return;
      }
      try {
        const { from } = editor.state.selection;
        const domInfo = editor.view.domAtPos(from);
        let node = domInfo.node as HTMLElement;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement as HTMLElement;
        while (node && node.tagName !== "TABLE") node = node.parentElement as HTMLElement;
        if (!node || node.tagName !== "TABLE") { setTableToolbar(null); return; }
        const tableRect = node.getBoundingClientRect();
        // Collect first-row cells for column tabs
        const firstRow = node.querySelector("tr:first-child");
        const cellEls: HTMLElement[] = firstRow
          ? (Array.from(firstRow.querySelectorAll("th, td")) as HTMLElement[])
          : [];
        tableColumnCellsRef.current = cellEls;
        const columns = cellEls.map((c) => c.getBoundingClientRect());
        const $from = editor.state.doc.resolve(from);
        let striped = false;
        for (let d = $from.depth; d >= 0; d--) {
          const n = $from.node(d);
          if (n.type.name === "table") { striped = !!n.attrs.striped; break; }
        }
        // Use functional updater: only create a new object when values actually
        // changed, so React bails out on unchanged transactions (fixes infinite loop).
        setTableToolbar((prev) => {
          if (
            prev &&
            prev.striped === striped &&
            prev.tableRect.top === tableRect.top &&
            prev.tableRect.left === tableRect.left &&
            prev.tableRect.right === tableRect.right &&
            prev.tableRect.bottom === tableRect.bottom &&
            prev.columns.length === columns.length &&
            prev.columns.every((r, i) =>
              r.left === columns[i].left &&
              r.top === columns[i].top &&
              r.width === columns[i].width
            )
          ) {
            return prev;
          }
          return { tableRect, striped, columns };
        });
      } catch {
        setTableToolbar(null);
      }
    };
    editor.on("selectionUpdate", update);
    editor.on("transaction", update);
    window.addEventListener("scroll", update, true);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("transaction", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [editor]);

  // Close menus when cursor leaves the table
  useEffect(() => {
    if (!tableToolbar) { setActiveColMenu(null); setTableOptionsOpen(false); }
  }, [tableToolbar]);

  // Close menus on outside click
  useEffect(() => {
    if (activeColMenu === null && !tableOptionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (tableOverlayRef.current && !tableOverlayRef.current.contains(e.target as Node)) {
        setActiveColMenu(null);
        setTableOptionsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [activeColMenu, tableOptionsOpen]);

  // Set z-index on bubble menu wrappers after editor + menus mount
  useEffect(() => {
    if (!editor) return;
    if (bubbleMenuElRef.current) bubbleMenuElRef.current.style.zIndex = "300";
    if (tableCellMenuElRef.current) tableCellMenuElRef.current.style.zIndex = "300";
  }, [editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const attrs = editor.getAttributes("link");
    const previous = attrs.href || "";
    const previousNewTab = attrs.target === "_blank";
    setUrlModal({ open: true, mode: "link", context: "bubble", initialValue: previous, initialOpenInNewTab: previousNewTab, targetEditor: editor });
  }, [editor, setUrlModal]);

  const focusColumn = useCallback((colIndex: number) => {
    if (!editor) return;
    const cell = tableColumnCellsRef.current[colIndex];
    if (!cell) return;
    try {
      const pos = editor.view.posAtDOM(cell, 0);
      editor.commands.setTextSelection(pos);
    } catch { /* ignore */ }
  }, [editor]);

  const toggleTableStriped = useCallback(() => {
    if (!editor) return;
    const { from } = editor.state.selection;
    const $from = editor.state.doc.resolve(from);
    for (let d = $from.depth; d >= 0; d--) {
      const node = $from.node(d);
      if (node.type.name === "table") {
        const pos = $from.start(d) - 1;
        editor.chain().command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, { ...node.attrs, striped: !node.attrs.striped });
          return true;
        }).run();
        break;
      }
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div ref={editorWrapRef} className={`group flex-1 overflow-auto bg-surface${!editable ? " read-mode" : ""}${lineSpacing === "spaced" ? " editor-spaced" : ""}`} spellCheck={spellcheckEnabled} lang={spellcheckLanguage}>
      {/* Template editing banner */}
      {isTemplate && (
        <div className="template-editor-banner">
          <span className="template-editor-badge">TEMPLATE</span>
          <span>You are editing a template — use <kbd>/</kbd> to insert Template Fields</span>
        </div>
      )}
      <BubbleMenu
        ref={bubbleMenuElRef}
        editor={editor}
        pluginKey="textFormatMenu"
        options={{
          placement: "top", offset: 8, strategy: "fixed",
          onShow: () => {
            const el = bubbleMenuElRef.current;
            if (!el) return;
            el.style.opacity = "0";
            // Element was just appended to DOM by show(). The preceding
            // computePosition ran while the element was detached, so its
            // coordinates are wrong. Re-compute on the next frame (element
            // now has layout) then reveal on the frame after.
            requestAnimationFrame(() => {
              if (!editor || editor.isDestroyed) return;
              editor.view.dispatch(editor.state.tr.setMeta("textFormatMenu", "updatePosition"));
              requestAnimationFrame(() => { if (el.parentNode) el.style.opacity = "1"; });
            });
          },
        }}
        shouldShow={({ editor, state }) => {
          if (!editor.isEditable) return false;
          const { from, to } = state.selection;
          if (from === to) return false;
          if (state.selection instanceof NodeSelection) return false;
          if (editor.isActive("codeBlock")) return false;
          return true;
        }}
      >
        <div className="bubble-menu">
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
            className={`bubble-btn${editor.isActive("heading", { level: 1 }) ? " active" : ""}`}
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            className={`bubble-btn${editor.isActive("heading", { level: 2 }) ? " active" : ""}`}
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`bubble-btn${editor.isActive("heading", { level: 3 }) ? " active" : ""}`}
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>

          <div className="bubble-sep" />

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
      </BubbleMenu>

      {/* Cell background color picker (appears when cursor is inside a table cell) */}
      <BubbleMenu
        ref={tableCellMenuElRef}
        editor={editor}
        pluginKey="tableCellMenu"
        options={{
          placement: "bottom-start", offset: 6, strategy: "fixed",
          onShow: () => {
            const el = tableCellMenuElRef.current;
            if (!el) return;
            el.style.opacity = "0";
            requestAnimationFrame(() => {
              if (!editor || editor.isDestroyed) return;
              editor.view.dispatch(editor.state.tr.setMeta("tableCellMenu", "updatePosition"));
              requestAnimationFrame(() => { if (el.parentNode) el.style.opacity = "1"; });
            });
          },
        }}
        shouldShow={({ editor, state }) => {
          if (!editor.isEditable) return false;
          const { from, to } = state.selection;
          if (from !== to) return false;
          return editor.isActive("tableCell") || editor.isActive("tableHeader");
        }}
      >
        <div className="table-cell-menu" onMouseDown={(e) => e.preventDefault()}>
          {TABLE_CELL_COLORS.map((color, i) => (
            <button
              key={i}
              className={`table-color-swatch${color === null ? " clear" : ""}`}
              title={color || "Clear background"}
              style={color ? { background: color } : {}}
              onClick={() => {
                const type = editor.isActive("tableHeader") ? "tableHeader" : "tableCell";
                editor.chain().focus().updateAttributes(type, { backgroundColor: color }).run();
              }}
            />
          ))}
        </div>
      </BubbleMenu>

      <div style={PAGE_WIDTH_MAX[pageWidth] ? { maxWidth: PAGE_WIDTH_MAX[pageWidth], marginLeft: "auto", marginRight: "auto" } : {}}>
        <EditorContent editor={editor} className="tiptap-editor" />
      </div>

      {/* Hidden file inputs for slash commands */}
      <input
        ref={attachmentInputRef}
        type="file"
        className="hidden"
        accept="*/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file, false);
          e.target.value = "";
        }}
      />
      <input
        ref={pdfInputRef}
        type="file"
        className="hidden"
        accept=".pdf,application/pdf"
        multiple
        onChange={async (e) => {
          const files = e.target.files;
          if (!files || files.length === 0 || !spaceSlug) { e.target.value = ""; return; }
          const target = pendingSlashEditor || editor;
          for (const file of Array.from(files)) {
            if (file.size > MAX_UPLOAD_BYTES) {
              alert(`The file "${file.name}" exceeds the 50 MB upload limit and cannot be uploaded.`);
              continue;
            }
            const formData = new FormData();
            formData.append("file", file);
            formData.append("category", category || "General");
            try {
              const res = await fetch(
                `/api/spaces/${encodeURIComponent(spaceSlug)}/attachments`,
                { method: "POST", body: formData }
              );
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert((err as { error?: string }).error || `Upload of "${file.name}" failed.`);
                continue;
              }
              const data = await res.json();
              if (data.isDuplicate) {
                setPendingDuplicate({
                  sha256: data.sha256,
                  existingNames: data.existingNames,
                  file, isPdf: true,
                  size: file.size,
                  mimeType: file.type || "",
                });
                continue;
              }
              target?.chain().insertContent([
                { type: "pdfEmbed", attrs: {
                  filename: data.filename,
                  originalName: data.originalName,
                  category: data.category,
                  spaceSlug,
                  url: data.url,
                }},
                { type: "paragraph" },
              ]).run();
            } catch {
              alert(`Upload of "${file.name}" failed.`);
            }
          }
          setPendingSlashEditor(null);
          e.target.value = "";
        }}
      />

      {/* Duplicate file dialog */}
      {pendingDuplicate && (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setPendingDuplicate(null); }}>
          <div className="modal-container" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Duplicate File Detected</h2>
              <button className="modal-close" onClick={() => setPendingDuplicate(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-text-secondary mb-4">
                A file with identical content already exists. Choose which name to use — your choice will be applied to all existing references system-wide.
              </p>
              <div className="flex flex-col gap-2">
                {[...new Set(pendingDuplicate.existingNames)].slice(0, 5).map((name) => (
                  <button
                    key={name}
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-border hover:border-accent hover:bg-accent/5 transition-colors"
                    onClick={() => confirmDuplicate(name)}
                  >
                    <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-0.5">Use existing name</span>
                    <span className="text-sm font-medium text-text-primary truncate block">{name}</span>
                  </button>
                ))}
                <div className="flex items-center gap-2 my-1">
                  <hr className="flex-1 border-border" />
                  <span className="text-xs text-text-muted">or</span>
                  <hr className="flex-1 border-border" />
                </div>
                <button
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-accent bg-accent/5 hover:bg-accent/10 transition-colors"
                  onClick={() => confirmDuplicate(pendingDuplicate.file.name)}
                >
                  <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-0.5">Use my filename</span>
                  <span className="text-sm font-medium text-accent truncate block">{pendingDuplicate.file.name}</span>
                </button>
              </div>
              <div className="mt-4 flex justify-end">
                <button className="modal-btn-cancel" onClick={() => setPendingDuplicate(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Doc picker dialog (linked document slash command) */}
      {showDocPicker && spaceSlug && (
        <DocPickerDialog
          spaceSlug={spaceSlug}
          editor={pendingSlashEditor || editor}
          onClose={() => {
            setShowDocPicker(false);
            setPendingSlashEditor(null);
          }}
        />
      )}

      {/* Link hover preview card (fixed-position, follows mouse) */}
      {linkHover && (() => {
        const { href, rect, data, loading } = linkHover;
        const cardHeight = 220;
        const spaceBelow = typeof window !== "undefined" ? window.innerHeight - rect.bottom - 8 : 999;
        const left = typeof window !== "undefined"
          ? Math.min(rect.left, window.innerWidth - 328)
          : rect.left;
        const top = spaceBelow < cardHeight
          ? Math.max(4, rect.top - cardHeight - 8)
          : rect.bottom + 8;
        return (
          <div
            data-link-preview-card=""
            className="link-hover-preview"
            style={{ position: "fixed", left, top, zIndex: 9999 }}
            onMouseEnter={() => {
              if (hoverHideTimerRef.current) clearTimeout(hoverHideTimerRef.current);
            }}
            onMouseLeave={() => setLinkHover(null)}
          >
            {loading ? (
              <div className="link-hover-loading">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading preview…</span>
              </div>
            ) : (
              <>
                <div className="link-hover-title">
                  {!linkHoverFavErr && data?.favicon ? (
                    <img
                      src={data.favicon}
                      alt=""
                      className="w-4 h-4 rounded flex-shrink-0"
                      onError={() => setLinkHoverFavErr(true)}
                    />
                  ) : (
                    <Globe className="w-4 h-4 text-text-muted flex-shrink-0" />
                  )}
                  <span>{data?.title || (() => { try { return new URL(href).hostname; } catch { return href; } })()}</span>
                </div>
                {data?.description && (
                  <p className="link-hover-desc">{data.description}</p>
                )}
                {!linkHoverImgErr && data?.image && (
                  <img
                    src={data.image}
                    alt=""
                    className="link-hover-img"
                    onError={() => setLinkHoverImgErr(true)}
                  />
                )}
                <span className="link-hover-url">
                  <ExternalLink className="w-3 h-3 inline mr-1" />
                  {href.length > 55 ? href.slice(0, 52) + "…" : href}
                </span>
              </>
            )}
          </div>
        );
      })()}

      {/* Template field modal (slash:template-field) */}
      <TemplateFieldModal
        isOpen={tplFieldModalOpen}
        initial={tplEditInitial}
        onClose={() => {
          setTplFieldModalOpen(false);
          setPendingTplEditor(null);
          setTplEditPos(null);
          setTplEditInitial(undefined);
        }}
        onConfirm={(field) => {
          const target = pendingTplEditor || editor;
          if (tplEditPos !== null) {
            // Update the existing node in-place
            (target as any)?.chain().command(({ tr }: { tr: any }) => {
              tr.setNodeMarkup(tplEditPos, undefined, { fieldB64: toSafeB64(field) });
              return true;
            }).run();
          } else {
            (target?.commands as any)?.insertTemplatePlaceholder(field);
          }
          setPendingTplEditor(null);
          setTplEditPos(null);
          setTplEditInitial(undefined);
        }}
      />

      {/* Color picker (slash:color command) */}
      {showColorPicker && colorPickerPos && (
        <div
          ref={colorPickerRef}
          style={{ position: "fixed", left: colorPickerPos.x, top: colorPickerPos.y, zIndex: 9999 }}
          className="bg-surface border border-border rounded-lg shadow-lg p-3 w-[260px]"
        >
          <p className="text-xs font-medium text-text-muted mb-2">Pick a color</p>
          <div className="grid grid-cols-8 gap-1.5 mb-3">
            {["#EF4444","#F97316","#F59E0B","#EAB308","#84CC16","#22C55E","#14B8A6","#06B6D4","#3B82F6","#6366F1","#8B5CF6","#A855F7","#D946EF","#EC4899","#F43F5E","#78716C","#000000","#374151","#6B7280","#9CA3AF","#D1D5DB","#E5E7EB","#F3F4F6","#FFFFFF"].map((c) => (
              <button
                key={c}
                className={`w-6 h-6 rounded border ${colorPickerValue === c ? "ring-2 ring-accent ring-offset-1" : "border-border"}`}
                style={{ background: c }}
                onClick={() => setColorPickerValue(c)}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="color"
              value={colorPickerValue}
              onChange={(e) => setColorPickerValue(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0 p-0"
            />
            {colorPickerFormat === "hex" ? (
              <input
                type="text"
                value={colorPickerValue}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setColorPickerValue(v);
                }}
                className="flex-1 text-sm font-mono border border-border rounded px-2 py-1 bg-surface text-text-primary"
                placeholder="#hex"
              />
            ) : (
              <input
                type="text"
                value={(() => { const rgb = hexToRgb(colorPickerValue); return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : ""; })()}
                onChange={(e) => {
                  const parts = e.target.value.split(",").map((s) => s.trim());
                  if (parts.length === 3) {
                    const [r, g, b] = parts.map(Number);
                    if ([r, g, b].every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
                      setColorPickerValue(rgbToHex(r, g, b));
                    }
                  }
                }}
                className="flex-1 text-sm font-mono border border-border rounded px-2 py-1 bg-surface text-text-primary"
                placeholder="R, G, B"
              />
            )}
          </div>
          <div className="flex items-center gap-1 mb-3">
            <span className="text-xs text-text-muted mr-1">Format:</span>
            <button
              className={`px-2 py-0.5 text-xs rounded font-medium ${colorPickerFormat === "hex" ? "bg-accent text-white" : "bg-muted text-text-muted hover:text-text-secondary"}`}
              onClick={() => setColorPickerFormat("hex")}
            >HEX</button>
            <button
              className={`px-2 py-0.5 text-xs rounded font-medium ${colorPickerFormat === "rgb" ? "bg-accent text-white" : "bg-muted text-text-muted hover:text-text-secondary"}`}
              onClick={() => setColorPickerFormat("rgb")}
            >RGB</button>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs text-text-muted">Preview:</span>
            <span
              style={{ background: colorPickerValue, display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 4, fontSize: 11, fontFamily: "monospace", color: parseInt(colorPickerValue.slice(1, 3) || "ff", 16) * 0.299 + parseInt(colorPickerValue.slice(3, 5) || "ff", 16) * 0.587 + parseInt(colorPickerValue.slice(5, 7) || "ff", 16) * 0.114 > 150 ? "#000" : "#fff" }}
            >
              {colorDisplayValue()}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-accent text-white rounded hover:bg-accent-hover"
              onClick={() => {
                const hex = colorPickerValue.toUpperCase();
                const display = colorDisplayValue();
                const lum = parseInt(hex.slice(1, 3), 16) * 0.299 + parseInt(hex.slice(3, 5), 16) * 0.587 + parseInt(hex.slice(5, 7), 16) * 0.114;
                const textColor = lum > 150 ? "#000000" : "#FFFFFF";
                const target = pendingColorEditor || editor;
                target?.chain().focus().insertContent([
                  {
                    type: "text",
                    text: ` ${display} `,
                    marks: [
                      { type: "highlight", attrs: { color: hex } },
                      { type: "textStyle", attrs: { color: textColor } },
                    ],
                  },
                  { type: "text", text: " " },
                ]).run();
                setShowColorPicker(false);
                setPendingColorEditor(null);
              }}
            >Insert</button>
            <button
              className="px-3 py-1.5 text-xs text-text-muted hover:text-text-secondary"
              onClick={() => { setShowColorPicker(false); setPendingColorEditor(null); }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Emoji picker (slash:emoji command) */}
      {showEmojiPicker && emojiPickerPos && (
        <div
          style={{ position: "fixed", left: emojiPickerPos.x, top: emojiPickerPos.y, zIndex: 9999 }}
        >
          <Picker
            data={emojiPickerData}
            autoFocus
            theme={
              typeof document !== "undefined" &&
              (document.documentElement.dataset.theme === "dark" ||
               document.documentElement.dataset.theme === "dracula")
                ? "dark" : "light"
            }
            onEmojiSelect={(emoji: { native: string }) => {
              const target = pendingEmojiEditor || editor;
              target?.chain().focus().insertContent(emoji.native).run();
              setShowEmojiPicker(false);
              setPendingEmojiEditor(null);
              setEmojiPickerPos(null);
            }}
            onClickOutside={() => {
              setShowEmojiPicker(false);
              setPendingEmojiEditor(null);
              setEmojiPickerPos(null);
            }}
          />
        </div>
      )}

      {/* Math editor modal */}
      <MathEditorModal
        isOpen={mathEditorOpen}
        initialLatex={mathEditorInitial}
        onClose={() => {
          setMathEditorOpen(false);
          setPendingMathEditor(null);
          setMathEditorPos(null);
          setMathEditorInitial("");
        }}
        onConfirm={(latex) => {
          const target = pendingMathEditor || editor;
          if (mathEditorPos !== null) {
            // Update existing equation
            target?.chain().command(({ tr }: { tr: any }) => {
              tr.setNodeMarkup(mathEditorPos, undefined, { latex });
              return true;
            }).run();
          } else {
            // Insert new equation
            target?.chain().focus().insertContent({
              type: "inlineMath",
              attrs: { latex },
            }).run();
          }
          setPendingMathEditor(null);
          setMathEditorPos(null);
          setMathEditorInitial("");
        }}
      />

      {/* Database create modal (slash:database command) */}
      <DatabaseCreateModal
        isOpen={showDatabaseCreateModal}
        onClose={() => {
          setShowDatabaseCreateModal(false);
          setPendingDatabaseEditor(null);
        }}
        onCreate={async (title, templateId) => {
          if (!spaceSlug) return;
          try {
            const res = await fetch(
              `/api/spaces/${encodeURIComponent(spaceSlug)}/enhanced-tables`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, templateId: templateId || undefined }),
              }
            );
            if (!res.ok) return;
            const db = await res.json();
            const target = pendingDatabaseEditor || editor;
            target?.commands.insertDatabaseBlock({
              dbId: db.id,
              viewId: db.views?.[0]?.id || "",
              spaceSlug,
            });
            // Notify page to refresh the sidebar databases list
            document.dispatchEvent(new CustomEvent("database:created", { bubbles: true }));
          } catch (err) {
            console.error("Failed to create database:", err);
          }
          setPendingDatabaseEditor(null);
        }}
      />

      {/* Insert existing database picker */}
      {showDbPicker && spaceSlug && (
        <DatabasePicker
          spaceSlug={spaceSlug}
          onSelect={(db) => {
            const target = pendingDbPickerEditor || editor;
            target?.commands.insertDatabaseBlock({
              dbId: db.id,
              viewId: db.viewId,
              spaceSlug: spaceSlug,
            });
            setShowDbPicker(false);
            setPendingDbPickerEditor(null);
          }}
          onClose={() => { setShowDbPicker(false); setPendingDbPickerEditor(null); }}
        />
      )}

      {/* URL input modal (link and image slash commands + bubble menu link) */}
      <UrlInputModal
        isOpen={urlModal.open}
        title={urlModal.mode === "image" ? "Insert Image" : "Insert Link"}
        placeholder="https://"
        initialValue={urlModal.initialValue}
        initialOpenInNewTab={urlModal.initialOpenInNewTab}
        confirmLabel={urlModal.mode === "image" ? "Insert Image" : urlModal.initialValue ? "Update Link" : "Insert Link"}
        icon={urlModal.mode === "image" ? "image" : "link"}
        showNewTabOption={urlModal.mode === "link"}
        showFileUpload={urlModal.mode === "image"}
        onFileUpload={handleImageUpload}
        onClose={() => setUrlModal((m) => ({ ...m, open: false }))}
        onConfirm={(url, openInNewTab) => {
          const target = urlModal.targetEditor || editor;
          const linkTarget = openInNewTab ? "_blank" : null;
          const linkRel = openInNewTab ? "noopener noreferrer" : null;
          if (urlModal.mode === "image") {
            // Both slash and bubble: insert image at cursor
            target?.chain().focus().setImage({ src: url }).run();
          } else if (urlModal.context === "bubble") {
            // Bubble menu: apply/remove link mark on selected text
            if (url === "") {
              target?.chain().focus().extendMarkRange("link").unsetLink().run();
            } else {
              target?.chain().focus().extendMarkRange("link").setLink({ href: url, target: linkTarget, rel: linkRel }).run();
            }
          } else {
            // Slash command: no text selected — insert the URL itself as linked text
            target?.chain().focus().insertContent({
              type: "text",
              text: url,
              marks: [{ type: "link", attrs: { href: url, target: linkTarget, rel: linkRel, class: "text-accent underline" } }],
            }).run();
          }
        }}
      />

      {/* Confluence-style table overlay: column tabs + table options */}
      {editable && tableToolbar && typeof window !== "undefined" && createPortal(
        <div ref={tableOverlayRef} onMouseDown={(e) => e.preventDefault()}>
          {/* Per-column header tabs */}
          {tableToolbar.columns.map((colRect, i) => (
            <div
              key={i}
              className="table-col-tab"
              style={{
                top: Math.max(4, colRect.top - 22),
                left: colRect.left + colRect.width / 2,
              }}
            >
              <button
                className="table-col-tab-btn"
                onClick={() => {
                  focusColumn(i);
                  setActiveColMenu(activeColMenu === i ? null : i);
                  setTableOptionsOpen(false);
                }}
              >▾</button>
              {activeColMenu === i && (
                <div className="table-col-dropdown">
                  <button className="table-tab-item" onClick={() => { editor.chain().focus().addColumnBefore().run(); setActiveColMenu(null); }}>← Add column before</button>
                  <button className="table-tab-item" onClick={() => { editor.chain().focus().addColumnAfter().run(); setActiveColMenu(null); }}>Add column after →</button>
                  <div className="table-tab-sep" />
                  <button className="table-tab-item danger" onClick={() => { editor.chain().focus().deleteColumn().run(); setActiveColMenu(null); }}>Delete column</button>
                </div>
              )}
            </div>
          ))}
          {/* Table options pill — below the table */}
          <div
            className="table-tab"
            style={{
              top: Math.min(window.innerHeight - 40, tableToolbar.tableRect.bottom + 4),
              left: tableToolbar.tableRect.left + tableToolbar.tableRect.width / 2,
            }}
          >
            <button
              className="table-tab-btn"
              onClick={() => { setTableOptionsOpen((o) => !o); setActiveColMenu(null); }}
            >
              Table options {tableOptionsOpen ? "▴" : "▾"}
            </button>
            {tableOptionsOpen && (
              <div className="table-tab-dropdown">
                <div className="table-tab-section">Rows</div>
                <button className="table-tab-item" onClick={() => { editor.chain().focus().addRowBefore().run(); setTableOptionsOpen(false); }}>↑ Add row above</button>
                <button className="table-tab-item" onClick={() => { editor.chain().focus().addRowAfter().run(); setTableOptionsOpen(false); }}>Add row below ↓</button>
                <button className="table-tab-item danger" onClick={() => { editor.chain().focus().deleteRow().run(); setTableOptionsOpen(false); }}>Delete row</button>
                <div className="table-tab-sep" />
                <div className="table-tab-section">Cells</div>
                <button className="table-tab-item" onClick={() => { editor.chain().focus().mergeCells().run(); setTableOptionsOpen(false); }}>Merge cells</button>
                <button className="table-tab-item" onClick={() => { editor.chain().focus().splitCell().run(); setTableOptionsOpen(false); }}>Split cell</button>
                <div className="table-tab-sep" />
                <button className="table-tab-item" onClick={() => { editor.chain().focus().toggleHeaderRow().run(); setTableOptionsOpen(false); }}>Toggle header row</button>
                <button
                  className={`table-tab-item${tableToolbar.striped ? " check" : ""}`}
                  onClick={() => { toggleTableStriped(); setTableOptionsOpen(false); }}
                >{tableToolbar.striped ? "✓ " : "   "}Striped rows</button>
                <div className="table-tab-sep" />
                <button className="table-tab-item danger" onClick={() => { editor.chain().focus().deleteTable().run(); setTableOptionsOpen(false); }}>Delete table</button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
