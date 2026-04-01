"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Key, Plus, Trash2, Copy, Check, ShieldCheck, ShieldOff, RefreshCw } from "lucide-react";
import AvatarEditor from "@/components/AvatarEditor";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { isPasswordValid } from "@/lib/password-policy";
import { useTheme } from "@/components/ThemeProvider";
import { ACCENT_PRESETS } from "@/lib/accent-presets";
import { copyToClipboard } from "@/lib/clipboard";

interface ApiKeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const { setAccentColor, setFontSize } = useTheme();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [authSource, setAuthSource] = useState<"local" | "ad">("local");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [lineSpacing, setLineSpacing] = useState<"compact" | "spaced">("compact");
  const [fontSizePref, setFontSizePref] = useState<"sm" | "base" | "lg" | "xl">("base");
  const [alwaysShowToc, setAlwaysShowToc] = useState(false);
  const [accentColorPref, setAccentColorPref] = useState<string>("default");
  const [spellcheckEnabled, setSpellcheckEnabled] = useState(true);
  const [spellcheckLang, setSpellcheckLang] = useState("en");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<ApiKeyRecord[]>([]);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<{ id: string; secret: string } | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  // TOTP / MFA state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpBackupRemaining, setTotpBackupRemaining] = useState(0);
  const [totpSetupStep, setTotpSetupStep] = useState<"idle" | "scan" | "verify" | "backup">("idle");
  const [totpQr, setTotpQr] = useState("");
  const [totpSecret, setTotpSecret] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [totpNewBackupCodes, setTotpNewBackupCodes] = useState<string[]>([]);
  const [totpDisablePassword, setTotpDisablePassword] = useState("");
  const [totpShowDisable, setTotpShowDisable] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);

  const fetchApiKeys = async () => {
    const res = await fetch("/api/auth/api-keys");
    if (res.ok) {
      const data = await res.json();
      setApiKeys(data.keys ?? []);
    }
  };

  const fetchTotpStatus = async () => {
    const res = await fetch("/api/auth/totp");
    if (res.ok) {
      const d = await res.json();
      setTotpEnabled(d.totpEnabled ?? false);
      setTotpBackupRemaining(d.backupCodesRemaining ?? 0);
    }
  };

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { router.replace("/login"); return; }
        setUsername(data.username || "");
        setAuthSource(data.authSource === "ad" ? "ad" : "local");
        setFullName(data.fullName || "");
        setEmail(data.email || "");
        setAvatarUrl(`/api/auth/avatar/${encodeURIComponent(data.username)}?t=${Date.now()}`);
        setLineSpacing(data.preferences?.editorLineSpacing ?? "compact");
        setFontSizePref(data.preferences?.fontSize ?? "base");
        setAlwaysShowToc(data.preferences?.alwaysShowToc ?? false);
        setAccentColorPref(data.preferences?.accentColor ?? "default");
        setSpellcheckEnabled(data.preferences?.spellcheckEnabled ?? true);
        setSpellcheckLang(data.preferences?.spellcheckLanguage ?? "en");
        setLoading(false);
        fetchApiKeys();
        fetchTotpStatus();
      })
      .catch(() => router.replace("/login"));
  }, [router]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateApiKey = async () => {
    const name = newKeyName.trim();
    if (!name) { flash("Key name is required", "error"); return; }
    setCreatingKey(true);
    const body: Record<string, string> = { name };
    if (newKeyExpiry) body.expiresAt = new Date(newKeyExpiry).toISOString();
    const res = await fetch("/api/auth/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setCreatingKey(false);
    if (res.ok) {
      const data = await res.json();
      setRevealedSecret({ id: data.key.id, secret: data.secret });
      setNewKeyName("");
      setNewKeyExpiry("");
      fetchApiKeys();
    } else {
      const data = await res.json();
      flash(data.error || "Failed to create key", "error");
    }
  };

  const handleRevokeApiKey = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    const res = await fetch(`/api/auth/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) { fetchApiKeys(); if (revealedSecret?.id === id) setRevealedSecret(null); }
    else flash("Failed to revoke key", "error");
  };

  const copySecret = async (id: string, secret: string) => {
    await copyToClipboard(secret);
    setCopiedKeyId(id);
    setTimeout(() => setCopiedKeyId(null), 2000);
  };

  const handleSavePreferences = async () => {
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferences: { editorLineSpacing: lineSpacing, fontSize: fontSizePref, alwaysShowToc, accentColor: accentColorPref, spellcheckEnabled, spellcheckLanguage: spellcheckLang } }),
    });
    if (res.ok) flash("Preferences saved", "success");
    else flash("Failed to save preferences", "error");
  };

  const handleAvatarFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAvatarSave = async (blob: Blob) => {
    setAvatarFile(null);
    const formData = new FormData();
    formData.append("file", new File([blob], "avatar.png", { type: "image/png" }));
    const res = await fetch("/api/auth/avatar", { method: "POST", body: formData });
    if (res.ok) {
      setAvatarUrl(`/api/auth/avatar/${encodeURIComponent(username)}?t=${Date.now()}`);
      flash("Avatar updated", "success");
    } else {
      const data = await res.json();
      flash(data.error || "Failed to upload avatar", "error");
    }
  };

  const flash = (msg: string, type: "error" | "success") => {
    if (type === "error") { setError(msg); setSuccess(""); }
    else { setSuccess(msg); setError(""); }
    setTimeout(() => { setError(""); setSuccess(""); }, 3000);
  };

  const handleSaveProfile = async () => {
    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fullName, email }),
    });
    if (res.ok) flash("Profile updated", "success");
    else {
      const data = await res.json();
      flash(data.error || "Failed to update profile", "error");
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword) { flash("Current password is required", "error"); return; }
    if (!newPassword) { flash("New password is required", "error"); return; }
    if (newPassword !== confirmPassword) { flash("Passwords do not match", "error"); return; }

    const res = await fetch("/api/auth/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.ok) {
      flash("Password changed", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } else {
      const data = await res.json();
      flash(data.error || "Failed to change password", "error");
    }
  };

  if (loading) return null;

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="max-w-lg mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-lg hover:bg-muted-hover text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-text-primary">Profile</h1>
        </div>

        {/* Feedback */}
        {error && <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>}
        {success && <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{success}</div>}

        {/* Avatar + Profile info */}
        <div className="bg-surface rounded-xl shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Account</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            {/* Avatar */}
            <div className="flex items-center gap-4">
              <div className="relative group">
                <div className="w-16 h-16 rounded-full bg-accent text-white flex items-center justify-center text-xl font-medium overflow-hidden">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                      onError={() => setAvatarUrl(null)}
                    />
                  ) : (
                    username[0]?.toUpperCase() || "?"
                  )}
                </div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                >
                  <Camera className="w-5 h-5 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileSelect}
                  className="hidden"
                />
              </div>
              <div>
                <p className="text-sm font-medium text-text-primary">{username}</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-accent hover:underline"
                >
                  Change avatar
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Username</label>
              <input
                type="text"
                value={username}
                disabled
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-[var(--color-muted)] text-text-muted cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                placeholder="your@email.com"
              />
            </div>
            <div className="pt-2">
              <button
                onClick={handleSaveProfile}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {/* Editor preferences */}
        <div className="bg-surface rounded-xl shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Editor Preferences</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Paragraph spacing</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setLineSpacing("compact")}
                  className={`flex-1 flex flex-col items-start gap-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                    lineSpacing === "compact"
                      ? "border-accent bg-accent-light"
                      : "border-border bg-muted/30 hover:border-border-light"
                  }`}
                >
                  <span className={`text-sm font-medium ${lineSpacing === "compact" ? "text-accent-text" : "text-text-primary"}`}>
                    Compact
                  </span>
                  <span className="text-xs text-text-muted leading-tight">
                    Enter goes to next line — no extra gap between paragraphs
                  </span>
                  <div className="mt-1.5 text-[11px] text-text-muted leading-tight opacity-70 border-l-2 border-text-muted/30 pl-2">
                    <div>First line of text</div>
                    <div>Second line right below</div>
                    <div>Third line, same density</div>
                  </div>
                </button>
                <button
                  onClick={() => setLineSpacing("spaced")}
                  className={`flex-1 flex flex-col items-start gap-1 px-4 py-3 rounded-lg border-2 text-left transition-colors ${
                    lineSpacing === "spaced"
                      ? "border-accent bg-accent-light"
                      : "border-border bg-muted/30 hover:border-border-light"
                  }`}
                >
                  <span className={`text-sm font-medium ${lineSpacing === "spaced" ? "text-accent-text" : "text-text-primary"}`}>
                    Spaced
                  </span>
                  <span className="text-xs text-text-muted leading-tight">
                    Enter creates a new paragraph with extra whitespace
                  </span>
                  <div className="mt-1.5 text-[11px] text-text-muted leading-tight opacity-70 border-l-2 border-text-muted/30 pl-2">
                    <div>First paragraph</div>
                    <div className="mt-2">Second paragraph</div>
                    <div className="mt-2">Third paragraph</div>
                  </div>
                </button>
              </div>
            </div>
            {/* Interface font size */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Interface font size</label>
              <div className="flex items-center gap-2">
                {([
                  { value: "sm",   label: "S",  desc: "Small" },
                  { value: "base", label: "M",  desc: "Normal" },
                  { value: "lg",   label: "L",  desc: "Large" },
                  { value: "xl",   label: "XL", desc: "X-Large" },
                ] as { value: "sm" | "base" | "lg" | "xl"; label: string; desc: string }[]).map(({ value, label, desc }) => (
                  <button
                    key={value}
                    onClick={() => { setFontSizePref(value); setFontSize(value); }}
                    className={`flex flex-col items-center gap-0.5 px-4 py-2.5 rounded-lg border-2 transition-colors min-w-[64px] ${
                      fontSizePref === value
                        ? "border-accent bg-accent-light"
                        : "border-border bg-muted/30 hover:border-border"
                    }`}
                  >
                    <span className={`font-bold leading-none ${
                      value === "sm" ? "text-xs" : value === "base" ? "text-sm" : value === "lg" ? "text-base" : "text-xl"
                    } ${ fontSizePref === value ? "text-accent-text" : "text-text-primary" }`}>
                      Aa
                    </span>
                    <span className={`text-[10px] ${ fontSizePref === value ? "text-accent-text" : "text-text-muted" }`}>{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Accent colour */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Accent color</label>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Default swatch — tracks the current theme */}
                <button
                  onClick={() => { setAccentColorPref("default"); setAccentColor("default"); }}
                  title="Default (follows theme)"
                  className={`relative w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none ${
                    accentColorPref === "default"
                      ? "border-text-primary scale-110"
                      : "border-border"
                  }`}
                  style={{ background: "var(--color-accent)" }}
                >
                  {accentColorPref === "default" && (
                    <Check className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow" />
                  )}
                </button>
                {/* Preset swatches */}
                {Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => { setAccentColorPref(key); setAccentColor(key); }}
                    title={preset.label}
                    className={`relative w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 focus:outline-none ${
                      accentColorPref === key
                        ? "border-text-primary scale-110"
                        : "border-transparent"
                    }`}
                    style={{ background: preset.swatch }}
                  >
                    {accentColorPref === key && (
                      <Check className="absolute inset-0 m-auto w-3.5 h-3.5 text-white drop-shadow" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-1.5">
                &ldquo;Default&rdquo; follows the active theme. Changes preview instantly.
              </p>
            </div>

            {/* Spellcheck */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-text-primary">Spellcheck</p>
                <p className="text-xs text-text-muted">Enable browser spellcheck in the editor</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={spellcheckLang}
                  onChange={(e) => setSpellcheckLang(e.target.value)}
                  disabled={!spellcheckEnabled}
                  className="text-xs border border-border rounded px-2 py-1 bg-surface text-text-primary disabled:opacity-40"
                >
                  <option value="en">English</option>
                  <option value="de">Deutsch</option>
                  <option value="nl">Nederlands</option>
                  <option value="fr">Français</option>
                  <option value="es">Español</option>
                  <option value="it">Italiano</option>
                  <option value="pt">Português</option>
                </select>
                <button
                  role="switch"
                  aria-checked={spellcheckEnabled}
                  onClick={() => setSpellcheckEnabled((v) => !v)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    spellcheckEnabled ? "bg-accent" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      spellcheckEnabled ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Always show TOC */}
            <div className="flex items-center justify-between py-1">
              <div>
                <p className="text-sm font-medium text-text-primary">Always show Table of Contents</p>
                <p className="text-xs text-text-muted">Open the TOC panel by default when reading documents</p>
              </div>
              <button
                role="switch"
                aria-checked={alwaysShowToc}
                onClick={() => setAlwaysShowToc((v) => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                  alwaysShowToc ? "bg-accent" : "bg-gray-300"
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                    alwaysShowToc ? "translate-x-4.5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            <div className="pt-1">
              <button
                onClick={handleSavePreferences}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>

        {/* API Keys */}
        <div className="bg-surface rounded-xl shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Key className="w-4 h-4 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">API Keys</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <p className="text-xs text-text-muted">
              API keys allow external tools to authenticate as you. They inherit your current permissions.
            </p>

            {/* Revealed secret one-time banner */}
            {revealedSecret && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 space-y-1">
                <p className="text-xs font-semibold text-green-800">Copy your key now — it won&apos;t be shown again.</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs font-mono text-green-900 break-all flex-1">{revealedSecret.secret}</code>
                  <button
                    onClick={() => copySecret(revealedSecret.id, revealedSecret.secret)}
                    className="shrink-0 p-1.5 rounded hover:bg-green-100 text-green-700 transition-colors"
                    title="Copy"
                  >
                    {copiedKeyId === revealedSecret.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <button
                  onClick={() => setRevealedSecret(null)}
                  className="text-xs text-green-700 underline hover:no-underline"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Key list */}
            {apiKeys.length > 0 ? (
              <div className="divide-y divide-border border border-border rounded-lg overflow-hidden">
                {apiKeys.map((k) => (
                  <div key={k.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text-primary">{k.name}</p>
                      <p className="text-xs text-text-muted font-mono">{k.prefix}…</p>
                      <p className="text-xs text-text-muted">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                        {k.expiresAt && <> · Expires {new Date(k.expiresAt).toLocaleDateString()}</>}
                        {k.lastUsedAt && <> · Last used {new Date(k.lastUsedAt).toLocaleDateString()}</>}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRevokeApiKey(k.id)}
                      className="p-1.5 rounded hover:bg-red-50 text-text-muted hover:text-red-600 transition-colors"
                      title="Revoke"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-muted">No API keys yet.</p>
            )}

            {/* Create form */}
            <div className="pt-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Key name (e.g. CI pipeline)"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateApiKey()}
                  className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                />
                <input
                  type="date"
                  title="Expiry date (optional)"
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(e.target.value)}
                  min={new Date().toISOString().split("T")[0]}
                  className="w-36 px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                />
              </div>
              <button
                onClick={handleCreateApiKey}
                disabled={creatingKey}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {creatingKey ? "Creating…" : "Create key"}
              </button>
            </div>
          </div>
        </div>

        {/* Two-Factor Authentication */}
        <div className="bg-surface rounded-xl shadow-sm border border-border mb-6">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-text-muted" />
            <h2 className="text-lg font-semibold text-text-primary">Two-Factor Authentication</h2>
            {totpEnabled && (
              <span className="ml-auto px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Enabled</span>
            )}
          </div>
          <div className="px-6 py-4 space-y-4">
            {!totpEnabled && totpSetupStep === "idle" && (
              <>
                <p className="text-sm text-text-muted">
                  Protect your account with a time-based one-time password (TOTP). Works with Apple Passwords, Google Authenticator, Microsoft Authenticator, and Authy.
                </p>
                <button
                  onClick={async () => {
                    setTotpLoading(true);
                    const res = await fetch("/api/auth/totp/setup", { method: "POST" });
                    if (res.ok) {
                      const d = await res.json();
                      setTotpQr(d.qr);
                      setTotpSecret(d.secret);
                      setTotpSetupStep("scan");
                    } else flash("Failed to start MFA setup", "error");
                    setTotpLoading(false);
                  }}
                  disabled={totpLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Set up MFA
                </button>
              </>
            )}

            {totpSetupStep === "scan" && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-text-primary">Step 1 — Scan this QR code with your authenticator app</p>
                <div className="flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={totpQr} alt="TOTP QR code" className="w-48 h-48 rounded-lg border border-border" />
                </div>
                <details className="text-xs text-text-muted">
                  <summary className="cursor-pointer select-none">Can&apos;t scan? Enter key manually</summary>
                  <code className="block mt-1 font-mono bg-muted px-2 py-1 rounded break-all">{totpSecret}</code>
                </details>
                <button
                  onClick={() => setTotpSetupStep("verify")}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Next →
                </button>
                <button onClick={() => setTotpSetupStep("idle")} className="ml-3 text-sm text-text-muted hover:text-text-secondary">
                  Cancel
                </button>
              </div>
            )}

            {totpSetupStep === "verify" && (
              <div className="space-y-4">
                <p className="text-sm font-medium text-text-primary">Step 2 — Enter the 6-digit code shown in your app to confirm</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-40 px-3 py-2 text-center text-xl font-mono tracking-widest border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent bg-[var(--color-input-bg)] text-text-primary"
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                />
                <div className="flex items-center gap-3">
                  <button
                    disabled={totpLoading || totpCode.length < 6}
                    onClick={async () => {
                      setTotpLoading(true);
                      const res = await fetch("/api/auth/totp/enable", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ secret: totpSecret, code: totpCode }),
                      });
                      const d = await res.json();
                      setTotpLoading(false);
                      if (res.ok) {
                        setTotpNewBackupCodes(d.backupCodes);
                        setTotpSetupStep("backup");
                        setTotpEnabled(true);
                        setTotpBackupRemaining(d.backupCodes.length);
                      } else {
                        flash(d.error || "Invalid code", "error");
                        setTotpCode("");
                      }
                    }}
                    className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {totpLoading ? "Verifying…" : "Confirm"}
                  </button>
                  <button onClick={() => setTotpSetupStep("scan")} className="text-sm text-text-muted hover:text-text-secondary">
                    ← Back
                  </button>
                </div>
              </div>
            )}

            {totpSetupStep === "backup" && (
              <div className="space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ Save these backup codes now</p>
                  <p className="text-xs text-amber-700 mb-3">Each code can be used once if you lose access to your authenticator. They will not be shown again.</p>
                  <div className="grid grid-cols-2 gap-1">
                    {totpNewBackupCodes.map((c) => (
                      <code key={c} className="font-mono text-sm bg-white border border-amber-200 rounded px-2 py-1 text-center">{c}</code>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => { setTotpSetupStep("idle"); setTotpNewBackupCodes([]); setTotpCode(""); }}
                  className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
                >
                  Done — I&apos;ve saved my backup codes
                </button>
              </div>
            )}

            {totpEnabled && totpSetupStep === "idle" && (
              <div className="space-y-3">
                <p className="text-sm text-text-muted">
                  MFA is active. You have <strong>{totpBackupRemaining}</strong> backup code{totpBackupRemaining !== 1 ? "s" : ""} remaining.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={async () => {
                      if (!confirm("Regenerate backup codes? Your existing codes will stop working immediately.")) return;
                      const res = await fetch("/api/auth/totp/backup-codes", { method: "POST" });
                      if (res.ok) {
                        const d = await res.json();
                        setTotpNewBackupCodes(d.backupCodes);
                        setTotpBackupRemaining(d.backupCodes.length);
                        setTotpSetupStep("backup");
                      } else flash("Failed to regenerate backup codes", "error");
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate backup codes
                  </button>
                </div>
                <p className="text-xs text-text-muted flex items-center gap-1.5">
                  <ShieldOff className="w-3 h-3" />
                  MFA is enforced by security policy and cannot be disabled. Contact an admin if you have lost access to your authenticator.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Change password — hidden for AD accounts */}
        {authSource === "ad" ? (
          <div className="bg-surface rounded-xl shadow-sm border border-border">
            <div className="px-6 py-4 border-b border-border flex items-center gap-2">
              <h2 className="text-lg font-semibold text-text-primary">Password</h2>
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">Active Directory</span>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-text-muted">
                This account is managed through <strong>Active Directory</strong>. Password changes must be made in AD — contact your system administrator.
              </p>
            </div>
          </div>
        ) : (
        <div className="bg-surface rounded-xl shadow-sm border border-border">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-text-primary">Change Password</h2>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                autoComplete="new-password"
              />
              <PasswordStrengthMeter
                password={newPassword}
                context={{ username, fullName }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>
            <div className="pt-2">
              <button
                onClick={handleChangePassword}
                disabled={!isPasswordValid(newPassword, { username, fullName }) || newPassword !== confirmPassword || !currentPassword}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Avatar Editor Modal */}
      {avatarFile && (
        <AvatarEditor
          imageFile={avatarFile}
          onSave={handleAvatarSave}
          onCancel={() => setAvatarFile(null)}
        />
      )}
    </div>
  );
}
