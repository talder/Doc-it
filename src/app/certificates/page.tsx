"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import CertificatesTab from "@/components/admin/CertificatesTab";
import type { SanitizedUser } from "@/lib/types";

export default function CertificatesPage() {
  const router = useRouter();
  const [user, setUser] = useState<SanitizedUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user?.isAdmin) {
          router.replace("/");
          return;
        }
        setUser(data.user);
        setChecking(false);
      });
  }, [router]);

  if (checking || !user) return <div className="min-h-screen bg-surface-alt" />;

  return (
    <div className="min-h-screen bg-surface-alt">
      <div className="max-w-7xl mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push("/")}
            className="p-2 rounded-lg hover:bg-muted-hover text-gray-500 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <ShieldCheck className="w-6 h-6 text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">Certificate Manager</h1>
        </div>

        <CertificatesTab />
      </div>
    </div>
  );
}
