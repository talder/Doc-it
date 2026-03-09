"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { useEffect, useRef } from "react";
import { marked } from "marked";
import TurndownService from "turndown";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Highlighter,
  Heading1, Heading2, Heading3, List, ListOrdered, ListTodo,
  Quote, Code, Link as LinkIcon, Minus,
} from "lucide-react";

// ── Minimal turndown for journal content ──────────────────────────────────────
const td = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
td.addRule("taskListItem", {
  filter: (node) =>
    node.nodeName === "LI" && node.getAttribute("data-type") === "taskItem",
  replacement: (content, node) => {
    const checked = (node as HTMLElement).getAttribute("data-checked") === "true";
    return `${checked ? "- [x]" : "- [ ]"} ${content.trim()}\n`;
  },
});
td.addRule("underline", {
  filter: ["u"],
  replacement: (content) => `<u>${content}</u>`,
});

// ── Props ─────────────────────────────────────────────────────────────────────
interface JournalEditorProps {
  value: string; // markdown
  onChange: (markdown: string) => void;
  minHeight?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function JournalEditor({ value, onChange, minHeight = 200 }: JournalEditorProps) {
  const isExternal = useRef(false);
  const lastMd = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "je-link" } }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      if (isExternal.current) return;
      const md = td.turndown(editor.getHTML());
      lastMd.current = md;
      onChange(md);
    },
  });

  // Load initial content on mount
  useEffect(() => {
    if (!editor) return;
    isExternal.current = true;
    editor.commands.setContent(marked.parse(value, { async: false }) as string);
    setTimeout(() => { isExternal.current = false; }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Sync external value changes (e.g. template applied)
  useEffect(() => {
    if (!editor) return;
    if (value === lastMd.current) return;
    isExternal.current = true;
    editor.commands.setContent(marked.parse(value, { async: false }) as string);
    lastMd.current = value;
    setTimeout(() => { isExternal.current = false; }, 100);
  }, [editor, value]);

  const handleLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes("link").href ?? "";
    const url = window.prompt("Enter URL:", prev);
    if (url === null) return;
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  if (!editor) return null;

  const btn = (active: boolean) => `je-btn${active ? " je-btn--active" : ""}`;

  return (
    <div className="je-wrap">
      {/* Toolbar — mouseDown preventDefault keeps focus in editor */}
      <div className="je-toolbar" onMouseDown={(e) => e.preventDefault()}>
        {/* Text formatting */}
        <button type="button" className={btn(editor.isActive("bold"))}
          onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("italic"))}
          onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("underline"))}
          onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("strike"))}
          onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
          <Strikethrough className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("highlight"))}
          onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
          <Highlighter className="w-3.5 h-3.5" />
        </button>

        <div className="je-sep" />

        {/* Headings */}
        <button type="button" className={btn(editor.isActive("heading", { level: 1 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
          <Heading1 className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("heading", { level: 2 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
          <Heading2 className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("heading", { level: 3 }))}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
          <Heading3 className="w-3.5 h-3.5" />
        </button>

        <div className="je-sep" />

        {/* Lists */}
        <button type="button" className={btn(editor.isActive("bulletList"))}
          onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <List className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("orderedList"))}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("taskList"))}
          onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task list">
          <ListTodo className="w-3.5 h-3.5" />
        </button>

        <div className="je-sep" />

        {/* Blocks */}
        <button type="button" className={btn(editor.isActive("blockquote"))}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
          <Quote className="w-3.5 h-3.5" />
        </button>
        <button type="button" className={btn(editor.isActive("codeBlock"))}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code block">
          <Code className="w-3.5 h-3.5" />
        </button>

        <div className="je-sep" />

        {/* Insert */}
        <button type="button" className={btn(editor.isActive("link"))}
          onClick={handleLink} title="Link">
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="je-btn"
          onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editor content area */}
      <EditorContent editor={editor} className="je-content" style={{ minHeight }} />
    </div>
  );
}
