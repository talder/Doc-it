"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, HardDriveDownload, RefreshCw, Copy, Check, CheckCircle, ShieldCheck, Loader2 } from "lucide-react";
import { copyToClipboard } from "@/lib/clipboard";

// ~200 common, easy-to-remember English words (4-7 letters)
const WORD_LIST = [
  "apple","arrow","atlas","blade","bloom","brave","brush","cabin","candy","cargo",
  "cedar","chalk","chart","chess","chief","china","claim","clean","clear","climb",
  "clock","cloud","coast","coral","crane","crisp","crown","cycle","daily","dance",
  "delta","depot","depth","disco","dizzy","dodge","draft","drama","dream","drill",
  "eagle","early","earth","eight","elder","ember","epoch","evoke","extra","fable",
  "fairy","fancy","feast","fence","ferry","field","fifth","fight","finch","flame",
  "flask","fleet","flint","flood","flora","flute","focus","force","forge","forum",
  "frame","frank","freed","fresh","frost","fruit","fungi","ghost","glade","glass",
  "globe","gloom","glove","grain","grand","grant","grape","grasp","grass","green",
  "greet","grove","guava","guard","guide","guild","habit","happy","haven","haste",
  "heart","hedge","herbs","heron","hills","honey","horse","hotel","house","human",
  "hurry","image","inlet","irony","ivory","jewel","jolly","judge","juice","jumbo",
  "keeps","knack","knife","knoll","label","lance","laser","later","layer","leafy",
  "learn","ledge","lemon","light","limit","linen","links","lodge","logic","lotus",
  "lucky","lunar","lunch","mango","maple","march","marsh","match","medal","merge",
  "metal","might","model","money","moose","moors","moral","mount","mouse","music",
  "nerve","night","noble","north","notch","notes","novel","nurse","ocean","often",
  "onion","onset","orbit","order","otter","outer","oxide","ozone","paint","panic",
  "paper","party","patch","pause","peach","pearl","pedal","phase","pilot","pinch",
  "pixel","pizza","place","plain","plane","plant","plate","plaza","plume","point",
  "polar","poppy","porch","power","press","price","pride","prime","prism","prize",
  "probe","proof","prose","proud","pulse","punch","quest","quick","quiet","quota",
  "radar","radio","rainy","rally","ranch","range","rapid","raven","reach","ready",
  "realm","regal","relay","renew","repay","reset","ridge","rivet","robot","rocky",
  "rouge","rough","round","rover","royal","ruler","rural","rusty","saint","salsa",
  "sauce","scale","scene","scope","score","scout","seize","serve","seven","shade",
  "shake","shark","sharp","sheen","shell","shift","shine","shire","short","shout",
  "sight","silky","sixth","skill","slate","sleep","sleet","slide","slope","smart",
  "smile","snowy","solar","solid","solve","sonic","sorry","south","spare","spark",
  "speak","spell","spend","spice","spike","spire","split","spoon","spray","squad",
  "stack","staff","stage","stamp","stand","stark","start","stays","steal","steam",
  "steel","steep","stern","stick","still","stone","store","storm","story","stout",
  "strap","straw","stray","strip","study","style","sugar","sunny","surge","sweet",
  "swift","sword","talon","tango","taste","teach","tempo","tiger","tidal","toast",
  "token","today","topic","torch","total","tough","tower","trace","track","trade",
  "trail","train","trend","trial","troop","trout","truly","trunk","trust","truth",
  "tulip","tuner","turbo","twice","twist","ultra","unite","upper","urban","valid",
  "valor","value","vapor","vault","video","vigor","viral","vista","vital","vivid",
  "vocal","voice","voter","waltz","water","weave","wedge","wheat","wheel","white",
  "whole","wider","world","worth","wrath","youth","zebra","zesty","zones",
];

const SYMBOLS = ["!", "@", "#", "$", "%", "&", "?", "*"];

function generatePassphrase(): string {
  const arr = new Uint32Array(6);
  crypto.getRandomValues(arr);
  const w1 = WORD_LIST[arr[0] % WORD_LIST.length];
  const w2 = WORD_LIST[arr[1] % WORD_LIST.length];
  const w3 = WORD_LIST[arr[2] % WORD_LIST.length];
  const w4 = WORD_LIST[arr[3] % WORD_LIST.length];
  const num = String(arr[4] % 90 + 10); // 10-99
  const sym = SYMBOLS[arr[5] % SYMBOLS.length];
  return `${w1}-${w2}-${w3}-${w4}-${num}${sym}`;
}

type ModalPhase = "idle" | "building" | "ready" | "downloaded" | "job_error";

interface Props {
  onClose: () => void;
}

export default function OfflineBundleModal({ onClose }: Props) {
  const [passphrase, setPassphrase] = useState(() => generatePassphrase());
  const [copied, setCopied] = useState(false);
  const [noted, setNoted] = useState(false);
  const [phase, setPhase] = useState<ModalPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clean up polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleRegenerate = useCallback(() => {
    setPassphrase(generatePassphrase());
    setCopied(false);
    setNoted(false);
    setError(null);
  }, []);

  const handleCopy = useCallback(async () => {
    await copyToClipboard(passphrase);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }, [passphrase]);

  const startPolling = useCallback((jId: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const r = await fetch(`/api/offline-bundle?jobId=${encodeURIComponent(jId)}`);
        if (!r.ok) return;
        const data = await r.json();
        if (data.status === "done") {
          clearInterval(pollRef.current!);
          setFilename(data.filename ?? null);
          setPhase("ready");
        } else if (data.status === "error") {
          clearInterval(pollRef.current!);
          setError(data.error ?? "Generation failed");
          setPhase("job_error");
        }
      } catch { /* network hiccup — keep polling */ }
    }, 2000);
  }, []);

  const handleGenerate = async () => {
    setError(null);
    setPhase("building");
    try {
      const res = await fetch("/api/offline-bundle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? `Server error ${res.status}`);
      }
      const { jobId: jId } = await res.json();
      setJobId(jId);
      startPolling(jId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  };

  const handleDownload = () => {
    if (!jobId) return;
    window.location.href = `/api/offline-bundle/download?jobId=${encodeURIComponent(jobId)}`;
    setPhase("downloaded");
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-container" style={{ width: 500, maxWidth: "95vw" }}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <HardDriveDownload className="w-5 h-5 text-accent" />
            <span className="modal-title">Download Offline Bundle</span>
          </div>
          <button className="modal-close" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: "20px 24px 24px" }}>
          {phase === "downloaded" ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle style={{ width: 48, height: 48, color: "#16a34a", margin: "0 auto 16px" }} />
              <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Bundle downloaded!</p>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 6, lineHeight: 1.6 }}>
                Unzip the file and open the HTML in any modern browser.
              </p>
              <div style={{ background: "var(--color-muted)", border: "1px solid var(--color-border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--color-text-secondary)", margin: "12px 0 20px", lineHeight: 1.6 }}>
                <strong>Store your passphrase securely.</strong> Without it, the bundle cannot be unlocked.
              </div>
              <button className="modal-btn-primary" onClick={onClose}>Close</button>
            </div>
          ) : phase === "building" ? (
            <div style={{ textAlign: "center", padding: "32px 0" }}>
              <Loader2 style={{ width: 40, height: 40, color: "var(--color-accent)", margin: "0 auto 16px", animation: "spin 1s linear infinite" }} />
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Building your bundle…</p>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", lineHeight: 1.6, marginBottom: 20 }}>
                This may take a minute for large documentation stores.<br />
                You can close this window — you&rsquo;ll receive a notification when the bundle is ready.
              </p>
              <button className="modal-btn-cancel" onClick={onClose}>Close &amp; notify me</button>
            </div>
          ) : phase === "ready" ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <CheckCircle style={{ width: 44, height: 44, color: "#16a34a", margin: "0 auto 14px" }} />
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Your bundle is ready!</p>
              {filename && <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 18 }}>{filename}</p>}
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="modal-btn-cancel" onClick={onClose}>Close</button>
                <button className="modal-btn-primary" onClick={handleDownload} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <HardDriveDownload style={{ width: 16, height: 16 }} />
                  Download Bundle
                </button>
              </div>
            </div>
          ) : phase === "job_error" ? (
            <div style={{ textAlign: "center", padding: "28px 0" }}>
              <p style={{ fontWeight: 600, fontSize: 15, color: "#dc2626", marginBottom: 8 }}>Generation failed</p>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 20 }}>{error}</p>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button className="modal-btn-cancel" onClick={onClose}>Close</button>
                <button className="modal-btn-primary" onClick={() => { setPhase("idle"); setError(null); }}>Try again</button>
              </div>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
                A strong passphrase has been generated for your bundle. Write it down or copy
                it to a safe place — it cannot be recovered after this window is closed.
              </p>

              {/* Generated passphrase display */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
                  Your bundle passphrase
                </label>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <div
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      background: "var(--color-surface-alt, #f8fafc)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontFamily: "ui-monospace, 'Cascadia Code', 'Fira Mono', monospace",
                      fontSize: 15,
                      fontWeight: 600,
                      letterSpacing: "0.02em",
                      color: "var(--text-primary)",
                      userSelect: "all",
                      wordBreak: "break-all",
                    }}
                  >
                    {passphrase}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="Copy passphrase"
                      style={{
                        flex: 1,
                        padding: "0 12px",
                        background: copied ? "#dcfce7" : "var(--color-surface-alt, #f8fafc)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        cursor: "pointer",
                        color: copied ? "#16a34a" : "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "background 0.2s, color 0.2s",
                        minWidth: 42,
                      }}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={handleRegenerate}
                      title="Generate a new passphrase"
                      style={{
                        flex: 1,
                        padding: "0 12px",
                        background: "var(--color-surface-alt, #f8fafc)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        cursor: "pointer",
                        color: "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        minWidth: 42,
                      }}
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 5 }}>
                  Click copy or select all. Use the refresh button to generate a different passphrase.
                </p>
              </div>

              {/* Confirmation checkbox */}
              <label
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "12px 14px",
                  background: noted ? "#dcfce7" : "var(--muted-bg, #f1f5f9)",
                  border: `1px solid ${noted ? "#86efac" : "var(--border)"}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  marginBottom: 16,
                  transition: "background 0.2s, border-color 0.2s",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                <input
                  type="checkbox"
                  checked={noted}
                  onChange={(e) => setNoted(e.target.checked)}
                  style={{ marginTop: 2, accentColor: "#16a34a", width: 16, height: 16, flexShrink: 0 }}
                />
                <span>
                  <strong>I have written down or securely stored this passphrase.</strong>{" "}
                  I understand that without it, the bundle cannot be unlocked.
                </span>
              </label>

              {/* NIS2 callout */}
              <div style={{ background: "var(--muted-bg, #f1f5f9)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                <ShieldCheck style={{ width: 14, height: 14, marginTop: 1, flexShrink: 0, color: "#3b82f6" }} />
                <span>
                  <strong>NIS2 compliance:</strong> This download is logged in the audit trail.
                  The bundle is encrypted with AES-256-GCM. Only someone with the passphrase can access the content.
                </span>
              </div>

              {error && (
                <p style={{ color: "var(--red, #dc2626)", fontSize: 13, marginBottom: 14 }}>
                  {error}
                </p>
              )}

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="modal-btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="modal-btn-primary"
                  onClick={handleGenerate}
                  disabled={!noted}
                  style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 200 }}
                >
                  <HardDriveDownload className="w-4 h-4" />
                  Generate Bundle
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
