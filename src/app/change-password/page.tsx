"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import PasswordStrengthMeter from "@/components/PasswordStrengthMeter";
import { isPasswordValid } from "@/lib/password-policy";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Verify the user is authenticated and actually needs to change password
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) { router.replace("/login"); return; }
        if (!data.user.mustChangePassword) { router.replace("/"); return; }
        setUsername(data.user.username ?? "");
        setFullName(data.user.fullName ?? "");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const allRulesPassed = isPasswordValid(newPassword, { username, fullName });
  const passwordsMatch = newPassword === confirm && confirm.length > 0;
  const canSubmit = allRulesPassed && passwordsMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, skipFirstLogin: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }
      router.push("/");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt">
      <div className="w-full max-w-sm">
        <div className="bg-surface rounded-xl shadow-lg p-8 border border-border">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-100 mb-3">
              <KeyRound className="w-6 h-6 text-amber-600" />
            </div>
            <h1 className="text-xl font-bold text-text-primary">Set your password</h1>
            <p className="text-sm text-text-muted mt-1">
              Your account requires a new password before you can continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                New password
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                autoComplete="new-password"
                autoFocus
              />
              <PasswordStrengthMeter
                password={newPassword}
                context={{ username, fullName }}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                autoComplete="new-password"
              />
              {confirm.length > 0 && !passwordsMatch && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
              {confirm.length > 0 && passwordsMatch && (
                <p className="text-xs text-green-600 mt-1">✓ Passwords match</p>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving…" : "Set password & continue"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
