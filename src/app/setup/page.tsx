"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    spaceName: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed");
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
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-xl shadow-lg p-8 border border-border">
          <div className="text-center mb-8">
            <img src="/logo.png" alt="Doc-it" className="w-40 h-40 mx-auto mb-2" />
            <p className="text-sm text-text-muted">
              Create your admin account and first space to get started.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Username</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="admin"
                required
                minLength={2}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="••••••"
                required
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">Confirm Password</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="••••••"
                required
                minLength={6}
              />
            </div>

            <hr className="border-border" />

            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">First Space Name</label>
              <input
                type="text"
                value={form.spaceName}
                onChange={(e) => setForm({ ...form, spaceName: e.target.value })}
                className="w-full px-3 py-2 bg-[var(--color-input-bg)] border border-[var(--color-input-border)] rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                placeholder="My Knowledgebase"
                required
              />
              <p className="text-xs text-text-muted mt-1">This will be your first documentation space.</p>
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
              {loading ? "Setting up..." : "Complete Setup"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
