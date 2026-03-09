"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked for better rendering
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Custom renderer for callout-style blockquotes (> [!WARNING], > [!NOTE], etc.)
const renderer = new marked.Renderer();
const origBlockquote = renderer.blockquote.bind(renderer);
renderer.blockquote = function ({ tokens, raw }) {
  const html = this.parser.parse(tokens);
  const match = html.match(/^\s*<p>\s*\[!(NOTE|TIP|WARNING|CAUTION|IMPORTANT)\]\s*<br>?\s*/i);
  if (match) {
    const type = match[1].toLowerCase();
    const iconMap: Record<string, string> = {
      note: "ℹ️", tip: "💡", warning: "⚠️", caution: "⚠️", important: "❗",
    };
    const colorMap: Record<string, string> = {
      note: "share-callout-info", tip: "share-callout-success",
      warning: "share-callout-warning", caution: "share-callout-warning",
      important: "share-callout-danger",
    };
    const body = html.replace(match[0], "<p>");
    return `<div class="share-callout ${colorMap[type] || "share-callout-info"}">
      <span class="share-callout-icon">${iconMap[type] || "ℹ️"}</span>
      <div class="share-callout-body">${body}</div>
    </div>`;
  }
  return (origBlockquote as any).call(this, { tokens, raw });
};
marked.use({ renderer });

export default function SharePage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState("");
  const [spaceName, setSpaceName] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  const applyContent = (data: { docName: string; category: string; spaceName: string; content: string }) => {
    setDocName(data.docName);
    setCategory(data.category);
    setSpaceName(data.spaceName);
    const rawHtml = marked.parse(data.content, { async: false }) as string;
    setHtmlContent(DOMPurify.sanitize(rawHtml));
    setNeedsPassword(false);
  };

  useEffect(() => {
    if (!token) return;
    fetch(`/api/share/${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({ error: "Not found" }));
          throw new Error(data.error || "Not found");
        }
        return r.json();
      })
      .then((data) => {
        if (data.hasPassword && !data.content) {
          setDocName(data.docName);
          setCategory(data.category);
          setSpaceName(data.spaceName);
          setNeedsPassword(true);
        } else {
          applyContent(data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleUnlock = async () => {
    if (!password.trim()) return;
    setUnlocking(true);
    setPasswordError(null);
    try {
      const r = await fetch(`/api/share/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPasswordError(data.error || "Incorrect password");
      } else {
        applyContent(data);
      }
    } catch {
      setPasswordError("An error occurred. Please try again.");
    } finally {
      setUnlocking(false);
    }
  };

  if (loading) {
    return (
      <div className="share-page-shell">
        <p className="share-loading">Loading shared document…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="share-page-shell">
        <div className="text-center">
          <h1 className="share-error-title">Document Not Available</h1>
          <p className="share-error-msg">{error}</p>
        </div>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="share-page-shell">
        <div className="share-pw-card">
          <div className="text-center mb-6">
            <div className="share-pw-icon-wrap">
              <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h1 className="text-lg font-bold text-gray-900">Password Required</h1>
            <p className="text-sm text-gray-500 mt-1">This document is password-protected.</p>
            {docName && <p className="text-xs text-gray-400 mt-1">{docName}</p>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); handleUnlock(); }} className="space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="share-pw-input"
            />
            {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
            <button
              type="submit"
              disabled={unlocking || !password.trim()}
              className="share-pw-btn"
            >
              {unlocking ? "Unlocking…" : "Unlock Document"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="share-page">
      <header className="share-header">
        <div>
          <span className="share-header-label">Shared Document</span>
          <h1 className="share-header-title">{docName}</h1>
          <p className="share-header-meta">{spaceName} / {category}</p>
        </div>
        <div className="share-header-brand">
          <span>Doc-it</span>
        </div>
      </header>
      <main className="share-main">
        <div
          className="share-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </main>
    </div>
  );
}
