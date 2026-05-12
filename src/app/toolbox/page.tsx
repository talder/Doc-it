"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Wrench, Copy, Check, RefreshCw, Key, FileCode,
  Hash, Link2, Fingerprint, Clock, KeyRound, Trash2,
} from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

// ── Helpers ──────────────────────────────────────────────────────────────────

function useCopy() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copy = useCallback((text: string, id: string) => {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }, []);
  return { copiedId, copy };
}

function CopyBtn({ text, id, copiedId, copy }: { text: string; id: string; copiedId: string | null; copy: (t: string, id: string) => void }) {
  return (
    <button onClick={() => copy(text, id)} className="p-1.5 rounded hover:bg-muted text-text-muted transition-colors" title="Copy">
      {copiedId === id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function OutputBox({ value, id, copiedId, copy, rows = 3 }: { value: string; id: string; copiedId: string | null; copy: (t: string, id: string) => void; rows?: number }) {
  return (
    <div className="relative">
      <textarea readOnly value={value} rows={rows} className="w-full px-3 py-2 pr-10 bg-surface-alt border border-border rounded-lg text-sm font-mono text-text-primary resize-none focus:outline-none" />
      {value && <div className="absolute top-2 right-2"><CopyBtn text={value} id={id} copiedId={copiedId} copy={copy} /></div>}
    </div>
  );
}

// ── Tool definitions ─────────────────────────────────────────────────────────

type ToolId = "token" | "base64" | "hash" | "url" | "uuid" | "timestamp" | "jwt";

interface ToolDef {
  id: ToolId;
  label: string;
  icon: React.ReactNode;
  description: string;
}

const TOOLS: ToolDef[] = [
  { id: "token",     label: "Token Generator",   icon: <Key className="w-4 h-4" />,         description: "Generate random tokens & passwords" },
  { id: "base64",    label: "Base64",             icon: <FileCode className="w-4 h-4" />,    description: "Encode & decode Base64 strings" },
  { id: "hash",      label: "Hash Generator",     icon: <Hash className="w-4 h-4" />,        description: "Generate MD5, SHA-1, SHA-256, SHA-512 hashes" },
  { id: "url",       label: "URL Encode/Decode",  icon: <Link2 className="w-4 h-4" />,       description: "Encode & decode URL components" },
  { id: "uuid",      label: "UUID Generator",     icon: <Fingerprint className="w-4 h-4" />, description: "Generate v4 UUIDs" },
  { id: "timestamp", label: "Timestamp",          icon: <Clock className="w-4 h-4" />,       description: "Convert between Unix timestamps and dates" },
  { id: "jwt",       label: "JWT Decoder",        icon: <KeyRound className="w-4 h-4" />,    description: "Decode and inspect JWT tokens" },
];

// ── Token Generator ──────────────────────────────────────────────────────────

function TokenTool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [length, setLength] = useState(32);
  const [format, setFormat] = useState<"base64" | "hex" | "alphanumeric">("base64");
  const [output, setOutput] = useState("");

  const generate = useCallback(() => {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    if (format === "base64") {
      setOutput(btoa(String.fromCharCode(...bytes)));
    } else if (format === "hex") {
      setOutput(Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join(""));
    } else {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      setOutput(Array.from(bytes).map(b => chars[b % chars.length]).join("").slice(0, length));
    }
  }, [length, format]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Length
          <input type="number" min={8} max={128} value={length} onChange={e => setLength(Number(e.target.value))}
            className="w-20 px-2 py-1.5 bg-surface-alt border border-border rounded-lg text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Format
          <select value={format} onChange={e => setFormat(e.target.value as typeof format)}
            className="px-2 py-1.5 bg-surface-alt border border-border rounded-lg text-sm">
            <option value="base64">Base64</option>
            <option value="hex">Hex</option>
            <option value="alphanumeric">Alphanumeric</option>
          </select>
        </label>
      </div>
      <button onClick={generate} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Generate
      </button>
      {output && <OutputBox value={output} id="token-out" copiedId={copiedId} copy={copy} rows={2} />}
    </div>
  );
}

// ── Base64 ───────────────────────────────────────────────────────────────────

function Base64Tool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [error, setError] = useState("");

  const convert = useCallback(() => {
    setError("");
    try {
      if (mode === "encode") {
        setOutput(btoa(unescape(encodeURIComponent(input))));
      } else {
        setOutput(decodeURIComponent(escape(atob(input.trim()))));
      }
    } catch {
      setError("Invalid input for " + mode);
      setOutput("");
    }
  }, [input, mode]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setMode("encode")} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${mode === "encode" ? "bg-accent text-white border-accent" : "border-border text-text-secondary hover:bg-muted"}`}>Encode</button>
        <button onClick={() => setMode("decode")} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${mode === "decode" ? "bg-accent text-white border-accent" : "border-border text-text-secondary hover:bg-muted"}`}>Decode</button>
      </div>
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={4} placeholder={mode === "encode" ? "Text to encode…" : "Base64 string to decode…"}
        className="w-full px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm font-mono text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
      <button onClick={convert} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
        {mode === "encode" ? "Encode" : "Decode"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {output && <OutputBox value={output} id="b64-out" copiedId={copiedId} copy={copy} rows={4} />}
    </div>
  );
}

// ── Hash Generator ───────────────────────────────────────────────────────────

function HashTool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [input, setInput] = useState("");
  const [hashes, setHashes] = useState<Record<string, string>>({});

  const generate = useCallback(async () => {
    const enc = new TextEncoder();
    const data = enc.encode(input);
    const results: Record<string, string> = {};
    for (const algo of ["SHA-1", "SHA-256", "SHA-512"]) {
      const buf = await crypto.subtle.digest(algo, data);
      results[algo] = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    setHashes(results);
  }, [input]);

  return (
    <div className="space-y-4">
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={3} placeholder="Text to hash…"
        className="w-full px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm font-mono text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
      <button onClick={generate} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
        Generate Hashes
      </button>
      {Object.keys(hashes).length > 0 && (
        <div className="space-y-3">
          {Object.entries(hashes).map(([algo, hash]) => (
            <div key={algo}>
              <label className="text-xs font-medium text-text-muted uppercase tracking-wider">{algo}</label>
              <OutputBox value={hash} id={`hash-${algo}`} copiedId={copiedId} copy={copy} rows={1} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── URL Encode/Decode ────────────────────────────────────────────────────────

function UrlTool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [mode, setMode] = useState<"encode" | "decode">("encode");
  const [error, setError] = useState("");

  const convert = useCallback(() => {
    setError("");
    try {
      setOutput(mode === "encode" ? encodeURIComponent(input) : decodeURIComponent(input));
    } catch {
      setError("Invalid input");
      setOutput("");
    }
  }, [input, mode]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button onClick={() => setMode("encode")} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${mode === "encode" ? "bg-accent text-white border-accent" : "border-border text-text-secondary hover:bg-muted"}`}>Encode</button>
        <button onClick={() => setMode("decode")} className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${mode === "decode" ? "bg-accent text-white border-accent" : "border-border text-text-secondary hover:bg-muted"}`}>Decode</button>
      </div>
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={3} placeholder={mode === "encode" ? "URL to encode…" : "Encoded URL to decode…"}
        className="w-full px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm font-mono text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
      <button onClick={convert} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
        {mode === "encode" ? "Encode" : "Decode"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {output && <OutputBox value={output} id="url-out" copiedId={copiedId} copy={copy} rows={3} />}
    </div>
  );
}

// ── UUID Generator ───────────────────────────────────────────────────────────

function UuidTool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [uuids, setUuids] = useState<string[]>([]);
  const [count, setCount] = useState(1);
  const [uppercase, setUppercase] = useState(false);

  const generate = useCallback(() => {
    const result: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = crypto.randomUUID();
      result.push(uppercase ? id.toUpperCase() : id);
    }
    setUuids(result);
  }, [count, uppercase]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-center">
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          Count
          <input type="number" min={1} max={50} value={count} onChange={e => setCount(Number(e.target.value))}
            className="w-20 px-2 py-1.5 bg-surface-alt border border-border rounded-lg text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-text-secondary">
          <input type="checkbox" checked={uppercase} onChange={e => setUppercase(e.target.checked)} className="rounded" />
          Uppercase
        </label>
      </div>
      <button onClick={generate} className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">
        <RefreshCw className="w-3.5 h-3.5" /> Generate
      </button>
      {uuids.length > 0 && <OutputBox value={uuids.join("\n")} id="uuid-out" copiedId={copiedId} copy={copy} rows={Math.min(uuids.length, 10)} />}
    </div>
  );
}

// ── Timestamp Converter ──────────────────────────────────────────────────────

function TimestampTool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [unix, setUnix] = useState("");
  const [iso, setIso] = useState("");
  const [error, setError] = useState("");

  const fromUnix = useCallback(() => {
    setError("");
    const n = Number(unix);
    if (isNaN(n)) { setError("Invalid timestamp"); return; }
    // Auto-detect seconds vs milliseconds
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (isNaN(d.getTime())) { setError("Invalid timestamp"); return; }
    setIso(d.toISOString());
  }, [unix]);

  const fromIso = useCallback(() => {
    setError("");
    const d = new Date(iso);
    if (isNaN(d.getTime())) { setError("Invalid date"); return; }
    setUnix(Math.floor(d.getTime() / 1000).toString());
  }, [iso]);

  const setNow = useCallback(() => {
    const now = new Date();
    setUnix(Math.floor(now.getTime() / 1000).toString());
    setIso(now.toISOString());
    setError("");
  }, []);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">Unix Timestamp</label>
          <div className="flex gap-2">
            <input value={unix} onChange={e => setUnix(e.target.value)} placeholder="e.g. 1715500000"
              className="flex-1 px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
            <button onClick={fromUnix} className="px-3 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors">→</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-text-muted uppercase tracking-wider mb-1">ISO 8601 / Date String</label>
          <div className="flex gap-2">
            <input value={iso} onChange={e => setIso(e.target.value)} placeholder="e.g. 2025-05-12T10:00:00Z"
              className="flex-1 px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent" />
            <button onClick={fromIso} className="px-3 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent-hover transition-colors">←</button>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={setNow} className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-lg text-sm text-text-secondary hover:bg-muted transition-colors">
          <Clock className="w-3.5 h-3.5" /> Now
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {unix && iso && !error && (
        <div className="flex gap-2">
          <CopyBtn text={unix} id="ts-unix" copiedId={copiedId} copy={copy} />
          <span className="text-xs text-text-muted self-center">Unix: {unix}</span>
          <span className="text-text-muted self-center">·</span>
          <CopyBtn text={iso} id="ts-iso" copiedId={copiedId} copy={copy} />
          <span className="text-xs text-text-muted self-center">ISO: {iso}</span>
        </div>
      )}
    </div>
  );
}

// ── JWT Decoder ──────────────────────────────────────────────────────────────

function JwtTool({ copiedId, copy }: { copiedId: string | null; copy: (t: string, id: string) => void }) {
  const [input, setInput] = useState("");
  const [header, setHeader] = useState("");
  const [payload, setPayload] = useState("");
  const [error, setError] = useState("");

  const decode = useCallback(() => {
    setError(""); setHeader(""); setPayload("");
    const parts = input.trim().split(".");
    if (parts.length < 2) { setError("Invalid JWT format (expected at least 2 parts separated by dots)"); return; }
    try {
      const h = JSON.parse(atob(parts[0].replace(/-/g, "+").replace(/_/g, "/")));
      setHeader(JSON.stringify(h, null, 2));
    } catch { setError("Failed to decode header"); return; }
    try {
      const p = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
      setPayload(JSON.stringify(p, null, 2));
    } catch { setError("Failed to decode payload"); return; }
  }, [input]);

  return (
    <div className="space-y-4">
      <textarea value={input} onChange={e => setInput(e.target.value)} rows={3} placeholder="Paste JWT token here…"
        className="w-full px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm font-mono text-text-primary resize-none focus:outline-none focus:ring-1 focus:ring-accent" />
      <div className="flex gap-2">
        <button onClick={decode} className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors">Decode</button>
        <button onClick={() => { setInput(""); setHeader(""); setPayload(""); setError(""); }} className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-text-secondary hover:bg-muted transition-colors">
          <Trash2 className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {header && (
        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Header</label>
          <OutputBox value={header} id="jwt-header" copiedId={copiedId} copy={copy} rows={4} />
        </div>
      )}
      {payload && (
        <div>
          <label className="text-xs font-medium text-text-muted uppercase tracking-wider">Payload</label>
          <OutputBox value={payload} id="jwt-payload" copiedId={copiedId} copy={copy} rows={8} />
        </div>
      )}
    </div>
  );
}

// ── Main Toolbox Page ────────────────────────────────────────────────────────

export default function ToolboxPage() {
  const router = useRouter();
  const [activeTool, setActiveTool] = useState<ToolId>("token");
  const { copiedId, copy } = useCopy();

  const tool = TOOLS.find(t => t.id === activeTool)!;

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="max-w-5xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.push("/")} className="p-2 rounded-lg hover:bg-muted-hover text-gray-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Wrench className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Toolbox</h1>
        </div>

        <div className="flex gap-6">
          {/* Tool sidebar */}
          <aside className="w-56 shrink-0">
            <nav className="space-y-1">
              {TOOLS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTool(t.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors ${
                    activeTool === t.id
                      ? "bg-accent/10 text-accent font-medium"
                      : "text-text-secondary hover:bg-muted hover:text-text-primary"
                  }`}
                >
                  {t.icon}
                  {t.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Tool content */}
          <div className="flex-1 min-w-0">
            <div className="bg-surface border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-accent">{tool.icon}</span>
                <h2 className="text-lg font-semibold text-text-primary">{tool.label}</h2>
              </div>
              <p className="text-sm text-text-muted mb-6">{tool.description}</p>

              {activeTool === "token" && <TokenTool copiedId={copiedId} copy={copy} />}
              {activeTool === "base64" && <Base64Tool copiedId={copiedId} copy={copy} />}
              {activeTool === "hash" && <HashTool copiedId={copiedId} copy={copy} />}
              {activeTool === "url" && <UrlTool copiedId={copiedId} copy={copy} />}
              {activeTool === "uuid" && <UuidTool copiedId={copiedId} copy={copy} />}
              {activeTool === "timestamp" && <TimestampTool copiedId={copiedId} copy={copy} />}
              {activeTool === "jwt" && <JwtTool copiedId={copiedId} copy={copy} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
