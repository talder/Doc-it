"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 2FA step
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const [totpCode, setTotpCode] = useState("");
  const totpRef = useRef<HTMLInputElement>(null);

  // Check if setup is needed
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.needsSetup) router.replace("/setup");
        if (data.user) router.replace("/");
      })
      .catch(() => {});
  }, [router]);

  useEffect(() => {
    if (step === "totp") totpRef.current?.focus();
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return;
      }

      if (data.requires2FA) {
        setStep("totp");
        return;
      }

      if (data.mustChangePassword) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: totpCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        setTotpCode("");
        return;
      }

      if (data.mustChangePassword) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
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
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-text-primary">Doc-it</h1>
            {step === "credentials" ? (
              <p className="text-sm text-text-muted mt-1">Sign in to continue</p>
            ) : (
              <div className="flex flex-col items-center gap-1 mt-2">
                <ShieldCheck className="w-6 h-6 text-accent" />
                <p className="text-sm font-medium text-text-primary">Two-factor authentication</p>
                <p className="text-xs text-text-muted">Enter the code from your authenticator app</p>
              </div>
            )}
          </div>

          {step === "credentials" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  required
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Authenticator code
                </label>
                <input
                  ref={totpRef}
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  placeholder="000000"
                  maxLength={9}
                  autoComplete="one-time-code"
                  required
                />
                <p className="text-xs text-text-muted mt-1 text-center">
                  Or enter a backup code (e.g. A3F2-B1C9)
                </p>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-accent text-white font-medium rounded-lg hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {loading ? "Verifying..." : "Verify"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("credentials"); setError(""); setTotpCode(""); }}
                className="w-full py-2 text-sm text-text-muted hover:text-text-secondary transition-colors"
              >
                ← Back to login
              </button>
            </form>
          )}

          {step === "credentials" && (
            <p className="text-center text-sm text-text-muted mt-6">
              Don&apos;t have an account?{" "}
              <Link href="/register" className="text-accent hover:underline font-medium">
                Create an account
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
