"use client";

import { useMemo } from "react";

function computeStats(md: string) {
  const plain = md
    .replace(/```[\s\S]*?```/g, " ")        // fenced code blocks
    .replace(/`[^`\n]+`/g, " ")              // inline code
    .replace(/^#{1,6}\s+/gm, "")            // headings
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")  // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → keep text
    .replace(/<!--[\s\S]*?-->/g, " ")        // html comments
    .replace(/[*_~]{1,3}/g, "")             // bold/italic/strikethrough markers
    .replace(/^[-*+]\s+/gm, "")             // unordered list markers
    .replace(/^\d+\.\s+/gm, "")             // ordered list markers
    .replace(/^>\s*/gm, "")                 // blockquote markers
    .trim();

  const words      = plain.length === 0 ? 0 : plain.split(/\s+/).filter(w => w.length > 0).length;
  const sentences  = plain.length === 0 ? 0 : (plain.match(/[.!?]+(?:\s|$)/g) || []).length;
  const paragraphs = md.split(/\n{2,}/).filter(p => p.trim().length > 0).length;
  const pages      = words === 0 ? 0 : Math.ceil(words / 500);

  return { words, sentences, paragraphs, pages };
}

interface DocStatsFooterProps {
  markdown: string | null;
}

export default function DocStatsFooter({ markdown }: DocStatsFooterProps) {
  const stats = useMemo(() => computeStats(markdown || ""), [markdown]);

  const items = [
    { label: "words",      value: stats.words      },
    { label: "sentences",  value: stats.sentences  },
    { label: "paragraphs", value: stats.paragraphs },
    { label: "A4 pages",   value: stats.pages      },
  ];

  return (
    <div className="doc-stats-footer">
      {markdown ? (
        items.map((item, i) => (
          <span key={item.label} className="doc-stats-item">
            <span className="doc-stats-value">{item.value}</span>
            <span className="doc-stats-label">{item.label}</span>
            {i < items.length - 1 && <span className="doc-stats-sep" aria-hidden>·</span>}
          </span>
        ))
      ) : (
        <span className="doc-stats-empty">No document open</span>
      )}
    </div>
  );
}
