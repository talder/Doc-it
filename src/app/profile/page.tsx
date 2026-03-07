"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera } from "lucide-react";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/auth/profile")
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { router.replace("/login"); return; }
        setUsername(data.username || "");
        setFullName(data.fullName || "");
        setEmail(data.email || "");
        setAvatarUrl(`/api/auth/avatar/${encodeURIComponent(data.username)}?t=${Date.now()}`);
        setLoading(false);
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("/api/auth/avatar", { method: "POST", body: formData });
    if (res.ok) {
      setAvatarUrl(`/api/auth/avatar/${encodeURIComponent(username)}?t=${Date.now()}`);
      flash("Avatar updated", "success");
    } else {
      const data = await res.json();
      flash(data.error || "Failed to upload avatar", "error");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
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
                  onChange={handleAvatarUpload}
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

        {/* Change password */}
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
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-[var(--color-input-bg)] text-text-primary"
              />
            </div>
            <div className="pt-2">
              <button
                onClick={handleChangePassword}
                className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
              >
                Change Password
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
