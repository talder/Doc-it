"use client";

import { useEffect, useState } from "react";
import { FileText, FilePlus, PenLine, Users, BarChart3, Quote } from "lucide-react";

interface RecentDoc {
  name: string;
  category: string;
  action: "created" | "updated";
  actor: string;
  timestamp: string;
}

interface SpaceStats {
  totalCreates: number;
  totalUpdates: number;
  uniqueEditors: number;
}

interface SpaceHomeProps {
  spaceSlug: string;
  spaceName: string;
  onOpenDoc: (name: string, category: string) => void;
}

const QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Documentation is a love letter that you write to your future self.", author: "Damian Conway" },
  { text: "Talk is cheap. Show me the code.", author: "Linus Torvalds" },
  { text: "First, solve the problem. Then, write the code.", author: "John Johnson" },
  { text: "Knowledge is power. Sharing knowledge is the key to unlocking that power.", author: "Martin Luther King Jr." },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Simplicity is the soul of efficiency.", author: "Austin Freeman" },
  { text: "Any fool can write code that a computer can understand. Good programmers write code that humans can understand.", author: "Martin Fowler" },
  { text: "The art of writing is the art of discovering what you believe.", author: "Gustave Flaubert" },
  { text: "Good documentation is like a good joke — if you have to explain it, it's not that good.", author: "Unknown" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Write what you know. That's all there is to it.", author: "Ernest Hemingway" },
  { text: "Clear thinking becomes clear writing; one can't exist without the other.", author: "William Zinsser" },
  { text: "If you can't explain it simply, you don't understand it well enough.", author: "Albert Einstein" },
];

function getQuoteOfDay() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return QUOTES[dayOfYear % QUOTES.length];
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SpaceHome({ spaceSlug, spaceName, onOpenDoc }: SpaceHomeProps) {
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [stats, setStats] = useState<SpaceStats | null>(null);
  const [loading, setLoading] = useState(true);

  const quote = getQuoteOfDay();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/spaces/${encodeURIComponent(spaceSlug)}/activity`)
      .then((r) => (r.ok ? r.json() : { recentDocs: [], stats: null }))
      .then((data) => {
        setRecentDocs(data.recentDocs || []);
        setStats(data.stats || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [spaceSlug]);

  return (
    <div className="flex-1 overflow-auto bg-surface">
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-text-primary mb-1">
            Welcome to {spaceName}
          </h1>
          <p className="text-sm text-text-muted">
            Your documentation hub — here&apos;s what&apos;s been happening.
          </p>
        </div>

        {/* Quote of the day */}
        <div className="mb-8 bg-accent/5 border border-accent/20 rounded-xl p-5 flex gap-3 items-start">
          <Quote className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-text-primary italic">&ldquo;{quote.text}&rdquo;</p>
            <p className="text-xs text-text-muted mt-1">— {quote.author}</p>
          </div>
        </div>

        {/* Stats cards */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <FilePlus className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{stats.totalCreates}</p>
                <p className="text-xs text-text-muted">Documents created</p>
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{stats.totalUpdates}</p>
                <p className="text-xs text-text-muted">Edits made</p>
              </div>
            </div>
            <div className="bg-surface border border-border rounded-xl p-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <p className="text-lg font-bold text-text-primary">{stats.uniqueEditors}</p>
                <p className="text-xs text-text-muted">Contributors</p>
              </div>
            </div>
          </div>
        )}

        {/* Recent documents */}
        <div>
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
            Recent Activity
          </h2>
          {loading ? (
            <p className="text-sm text-text-muted py-6 text-center">Loading…</p>
          ) : recentDocs.length === 0 ? (
            <div className="text-center py-10 text-text-muted">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No recent document activity yet.</p>
              <p className="text-xs mt-1">Create your first document to get started!</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentDocs.map((doc, i) => (
                <button
                  key={`${doc.category}/${doc.name}-${i}`}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-muted transition-colors text-left group"
                  onClick={() => onOpenDoc(doc.name, doc.category)}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    doc.action === "created"
                      ? "bg-green-500/10 text-green-600"
                      : "bg-blue-500/10 text-blue-600"
                  }`}>
                    {doc.action === "created" ? (
                      <FilePlus className="w-4 h-4" />
                    ) : (
                      <PenLine className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                      {doc.name}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {doc.category} · {doc.action} by {doc.actor}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                      doc.action === "created"
                        ? "bg-green-100 text-green-700"
                        : "bg-blue-100 text-blue-700"
                    }`}>
                      {doc.action}
                    </span>
                    <span className="text-xs text-text-muted">{timeAgo(doc.timestamp)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
