"use client";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Copy, Check, Code2 } from "lucide-react";
import { useState, useMemo, useCallback, useEffect } from "react";

const LANGUAGES: { value: string; label: string }[] = [
  { value: "plaintext", label: "Plain Text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "bash", label: "Bash" },
  { value: "shell", label: "Shell" },
  { value: "powershell", label: "PowerShell" },
  { value: "sql", label: "SQL" },
  { value: "html", label: "HTML" },
  { value: "xml", label: "XML" },
  { value: "css", label: "CSS" },
  { value: "scss", label: "SCSS" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "csharp", label: "C#" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "php", label: "PHP" },
  { value: "ruby", label: "Ruby" },
  { value: "kotlin", label: "Kotlin" },
  { value: "swift", label: "Swift" },
  { value: "r", label: "R" },
];

const THEMES: { value: string; label: string }[] = [
  { value: "dark",    label: "One Dark" },
  { value: "light",   label: "Light" },
  { value: "dracula", label: "Dracula" },
  { value: "monokai", label: "Monokai" },
  { value: "nord",    label: "Nord" },
];

export const CodeBlockNodeView = ({ node, updateAttributes, editor }: any) => {
  const [copied, setCopied] = useState(false);

  // Track isEditable reactively — setEditable() emits "update" but doesn't
  // change the ProseMirror node, so the NodeView's update() returns early and
  // the component never re-renders on its own.
  const [isEditable, setIsEditable] = useState<boolean>(
    () => editor?.isEditable ?? true,
  );
  useEffect(() => {
    if (!editor) return;
    const sync = () => setIsEditable(editor.isEditable ?? true);
    editor.on("update", sync);
    sync(); // apply immediately in case it already changed
    return () => editor.off("update", sync);
  }, [editor]);

  const language = node.attrs.language || "plaintext";
  const theme    = node.attrs.theme    || "dark";
  const code = node.textContent;

  const lineNumbers = useMemo(() => {
    const count = code.split("\n").length || 1;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [code]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value });
    },
    [updateAttributes],
  );

  const handleThemeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const t = e.target.value;
      updateAttributes({ theme: t });
      if (typeof window !== "undefined") {
        localStorage.setItem("codeblock-theme", t);
      }
    },
    [updateAttributes],
  );

  return (
    <NodeViewWrapper className={`code-block-container code-theme-${theme}`}>
      {/* Header */}
      <div className="code-block-header">
        <div className="code-block-header-left">
          <Code2 size={12} className="code-block-icon" />
          {isEditable ? (
            <select
              value={language}
              onChange={handleLanguageChange}
              className="code-lang-select"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          ) : (
            <span className="code-lang-label">
              {LANGUAGES.find((l) => l.value === language)?.label ?? language}
            </span>
          )}
        </div>
        <div className="code-block-header-right">
          {isEditable ? (
            <select
              value={theme}
              onChange={handleThemeChange}
              className="code-theme-select"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          ) : (
            <span className="code-theme-label">
              {THEMES.find((t) => t.value === theme)?.label ?? theme}
            </span>
          )}
          <button
            onClick={handleCopy}
            className={`code-copy-btn${copied ? " copied" : ""}`}
            title="Copy code"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="code-block-body">
        <div className="code-line-numbers" aria-hidden="true">
          {lineNumbers.map((num) => (
            <div key={num} className="code-line-num">{num}</div>
          ))}
        </div>
        <pre className="code-pre">
          {/* @ts-expect-error -- NodeViewContent 'as' typing is overly narrow */}
          <NodeViewContent as="code" className="code-content" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
};
