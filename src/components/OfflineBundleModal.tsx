"use client";

import { useState, useRef, useEffect } from "react";
import { X, HardDriveDownload, Lock, Eye, EyeOff, CheckCircle } from "lucide-react";

interface Props {
  onClose: () => void;
}

export default function OfflineBundleModal({ onClose }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const validate = (): string | null => {
    if (passphrase.length < 12) return "Passphrase must be at least 12 characters.";
    if (passphrase !== confirm) return "Passphrases do not match.";
    return null;
  };

  const strength = (() => {
    if (passphrase.length === 0) return null;
    let score = 0;
    if (passphrase.length >= 12) score++;
    if (passphrase.length >= 20) score++;
    if (/[A-Z]/.test(passphrase)) score++;
    if (/[0-9]/.test(passphrase)) score++;
    if (/[^a-zA-Z0-9]/.test(passphrase)) score++;
    if (score <= 2) return { label: "Weak", color: "var(--red, #dc2626)", pct: 33 };
    if (score <= 3) return { label: "Fair", color: "#f59e0b", pct: 60 };
    return { label: "Strong", color: "#16a34a", pct: 100 };
  })();

  const handleGenerate = async () => {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
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

      // Trigger browser download
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const nameMatch = cd.match(/filename="([^"]+)"/);
      const filename = nameMatch?.[1] ?? "doc-it-offline.zip";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-container" style={{ width: 480, maxWidth: "95vw" }}>
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
          {done ? (
            <div style={{ textAlign: "center", padding: "24px 0" }}>
              <CheckCircle style={{ width: 48, height: 48, color: "#16a34a", margin: "0 auto 16px" }} />
              <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Bundle downloaded!</p>
              <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Unzip the file and open the HTML in any modern browser.
                Enter your passphrase to unlock the content.
              </p>
              <button className="modal-btn-primary" style={{ marginTop: 20 }} onClick={onClose}>
                Close
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
                Generates a self-contained, encrypted HTML file with a snapshot
                of all your accessible documents and databases. No internet
                connection or server required to open it — just a browser.
              </p>

              {/* Passphrase */}
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
                  <Lock style={{ display: "inline", width: 12, height: 12, marginRight: 4 }} />
                  Passphrase (min. 12 characters)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    ref={inputRef}
                    type={showPw ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Choose a strong passphrase…"
                    className="modal-input"
                    style={{ paddingRight: 40 }}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}
                    tabIndex={-1}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Strength bar */}
                {strength && (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ height: 3, background: "var(--border)", borderRadius: 9999, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${strength.pct}%`, background: strength.color, transition: "width .3s, background .3s", borderRadius: 9999 }} />
                    </div>
                    <span style={{ fontSize: 11, color: strength.color, marginTop: 3, display: "block" }}>{strength.label}</span>
                  </div>
                )}
              </div>

              {/* Confirm passphrase */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>
                  Confirm passphrase
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showConfirm ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleGenerate(); }}
                    placeholder="Repeat the passphrase…"
                    className="modal-input"
                    style={{ paddingRight: 40 }}
                    autoComplete="new-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2 }}
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Info callout */}
              <div style={{ background: "var(--muted-bg, #f1f5f9)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
                <strong>NIS2 compliance:</strong> This download is logged in the audit trail.
                The bundle is encrypted with AES-256-GCM. Only someone with the passphrase
                can access the content.
              </div>

              {/* Error */}
              {error && (
                <p style={{ color: "var(--red, #dc2626)", fontSize: 13, marginBottom: 14 }}>
                  {error}
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button className="modal-btn-cancel" onClick={onClose} disabled={loading}>
                  Cancel
                </button>
                <button
                  className="modal-btn-primary"
                  onClick={handleGenerate}
                  disabled={loading || passphrase.length < 12}
                  style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 160 }}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" strokeOpacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1"/></svg>
                      Generating…
                    </>
                  ) : (
                    <>
                      <HardDriveDownload className="w-4 h-4" />
                      Generate &amp; Download
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
