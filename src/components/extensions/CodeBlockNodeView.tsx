"use client";

import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";
import { Copy, Check, Code2 } from "lucide-react";
import { useState, useMemo } from "react";

export const CodeBlockNodeView = ({ node }: any) => {
  const [copied, setCopied] = useState(false);
  const language = node.attrs.language || "plaintext";
  const code = node.textContent;

  const lineNumbers = useMemo(() => {
    const count = code.split("\n").length;
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <NodeViewWrapper className="code-block-container relative group my-4 overflow-hidden bg-[#1c1d22] rounded-lg">
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-[#abb2bf] bg-[#262626] px-4 py-1">
          <div className="flex items-center gap-1.5">
            <Code2 className="h-3 w-3" />
            <span className="uppercase tracking-wide">
              {language === "plaintext" ? "text" : language}
            </span>
          </div>
        </div>
        <button
          onClick={handleCopy}
          className="h-6 w-6 p-0 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors mr-2"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </div>

      <div className="flex min-h-full">
        <div className="py-4 pl-2 pr-3 text-right select-none bg-[#292a2b] text-sm font-mono">
          {lineNumbers.map((num) => (
            <div key={num} className="leading-[21px] text-[#5c6370] opacity-50">
              {num}
            </div>
          ))}
        </div>
        <pre className="!bg-transparent !p-4 !m-0 overflow-x-auto text-sm flex-1">
          {/* @ts-expect-error -- NodeViewContent 'as' typing is overly narrow */}
          <NodeViewContent as="code" className="!bg-transparent text-[#abb2bf]" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
};
