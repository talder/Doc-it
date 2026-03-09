"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Headset } from "lucide-react";

export default function PortalRegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "register", email, displayName, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Registration failed"); setLoading(false); return; }
      router.push("/portal/login");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-alt">
      <div className="bg-surface border border-border rounded-xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Headset className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-bold text-text-primary">Create Account</h1>
        </div>
        <form onSubmit={handleRegister}>
          <div className="cl-field mb-3">
            <label className="cl-label">Display Name</label>
            <input className="cl-input" required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div className="cl-field mb-3">
            <label className="cl-label">Email</label>
            <input className="cl-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="cl-field mb-4">
            <label className="cl-label">Password</label>
            <input className="cl-input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button className="cl-btn cl-btn--primary w-full" disabled={loading}>{loading ? "Creating…" : "Register"}</button>
        </form>
        <p className="text-sm text-text-muted text-center mt-4">
          Already have an account? <a href="/portal/login" className="text-accent hover:underline">Sign In</a>
        </p>
      </div>
    </div>
  );
}
