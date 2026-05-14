"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft, FileText, Globe, Monitor, Network, Server, Shield, Trash2, Users, Wifi,
} from "lucide-react";
import dynamic from "next/dynamic";

const ProvisionWizard = dynamic(() => import("@/components/provisioning/ProvisionWizard"), { ssr: false });
const DecommissionTab = dynamic(() => import("@/components/provisioning/DecommissionTab"), { ssr: false });
const DnsTab = dynamic(() => import("@/components/provisioning/DnsTab"), { ssr: false });
const DhcpTab = dynamic(() => import("@/components/provisioning/DhcpTab"), { ssr: false });
const AdTab = dynamic(() => import("@/components/provisioning/AdTab"), { ssr: false });
const VmDeployTab = dynamic(() => import("@/components/provisioning/VmDeployTab"), { ssr: false });
const NacTab = dynamic(() => import("@/components/provisioning/NacTab"), { ssr: false });
const CheckmkTab = dynamic(() => import("@/components/provisioning/CheckmkTab"), { ssr: false });
const AuditPanel = dynamic(() => import("@/components/provisioning/AuditPanel"), { ssr: false });
const AgentLogsPanel = dynamic(() => import("@/components/provisioning/AgentLogsPanel"), { ssr: false });

// ── Tab definitions ──────────────────────────────────────────────────────────

type TabId = "provision" | "decommission" | "deploy-vm" | "dns" | "dhcp" | "nac" | "checkmk" | "ad" | "audit" | "logs";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const TABS: TabDef[] = [
  { id: "provision",     label: "Provision",       icon: <Server className="w-4 h-4" /> },
  { id: "decommission",  label: "Decommission",    icon: <Trash2 className="w-4 h-4" /> },
  { id: "deploy-vm",     label: "Deploy VM",       icon: <Server className="w-4 h-4" /> },
  { id: "dns",           label: "DNS",             icon: <Globe className="w-4 h-4" /> },
  { id: "dhcp",      label: "DHCP",              icon: <Network className="w-4 h-4" /> },
  { id: "nac",       label: "NAC",               icon: <Wifi className="w-4 h-4" /> },
  { id: "checkmk",   label: "CheckMK",           icon: <Monitor className="w-4 h-4" /> },
  { id: "ad",        label: "Active Directory",  icon: <Users className="w-4 h-4" />, adminOnly: true },
  { id: "audit",     label: "Audit Log",         icon: <Shield className="w-4 h-4" /> },
  { id: "logs",      label: "Agent Logs",        icon: <FileText className="w-4 h-4" /> },
];

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ProvisioningPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(tabParam && TABS.some(t => t.id === tabParam) ? tabParam : "provision");
  const [isAdmin, setIsAdmin] = useState(false);

  // Check if user is admin (for AD tab visibility)
  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user?.isAdmin) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  // Sync tab with URL
  useEffect(() => {
    const newTab = searchParams.get("tab") as TabId | null;
    if (newTab && TABS.some(t => t.id === newTab)) setActiveTab(newTab);
  }, [searchParams]);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === "provision") params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(`/provisioning${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

  return (
    <div className="jp-root">
      {/* Header */}
      <header className="jp-header flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/")} className="jp-back"><ArrowLeft className="w-4 h-4" /></button>
          <Network className="w-5 h-5 text-accent flex-shrink-0" />
          <h1 className="text-lg font-bold text-text-primary whitespace-nowrap">Infrastructure Management</h1>
        </div>
      </header>

      {/* Tab bar */}
      <div className="flex-shrink-0 border-b border-border bg-surface px-6">
        <nav className="flex gap-1 -mb-px">
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => switchTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-primary hover:border-border"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="jp-main flex-1 overflow-hidden">
        {activeTab === "provision" && <ProvisionWizard />}
        {activeTab === "decommission" && <DecommissionTab />}
        {activeTab === "deploy-vm" && <VmDeployTab />}
        {activeTab === "dns" && <DnsTab />}
        {activeTab === "dhcp" && <DhcpTab />}
        {activeTab === "nac" && <NacTab />}
        {activeTab === "checkmk" && <CheckmkTab />}
        {activeTab === "ad" && isAdmin && <AdTab />}
        {activeTab === "audit" && <AuditPanel />}
        {activeTab === "logs" && <AgentLogsPanel />}
      </div>
    </div>
  );
}
