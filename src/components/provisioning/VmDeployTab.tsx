"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, CheckCircle, Clock, History,
  Loader2, Monitor, RefreshCw, Server, XCircle,
} from "lucide-react";
import type { VmDeployTemplate, VmDeployHistoryEntry } from "@/lib/vmware";

function fmtTime(iso: string) { try { return new Date(iso).toLocaleString(); } catch { return iso; } }

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: <Clock className="w-4 h-4 text-text-muted" />,
  running: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />,
  success: <CheckCircle className="w-4 h-4 text-green-600" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
};

type Step = 1 | 2 | 3 | 4;

export default function VmDeployTab() {
  const [step, setStep] = useState<Step>(1);
  const [showHistory, setShowHistory] = useState(false);

  // Step 1 — template selection
  const [templates, setTemplates] = useState<VmDeployTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<VmDeployTemplate | null>(null);

  // Step 2 — VM details
  const [vmName, setVmName] = useState("");
  const [ip, setIp] = useState("");
  const [subnetMask, setSubnetMask] = useState("255.255.255.0");
  const [gateway, setGateway] = useState("");
  const [dns, setDns] = useState("8.8.8.8");
  const [cpuCount, setCpuCount] = useState<number | "">("");
  const [memoryMiB, setMemoryMiB] = useState<number | "">("");

  // Step 4 — execution
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string; vmMoRef?: string } | null>(null);

  // History
  const [history, setHistory] = useState<VmDeployHistoryEntry[]>([]);

  // Load templates
  useEffect(() => {
    fetch("/api/vmware/deploy-templates")
      .then(r => r.ok ? r.json() : null)
      .then(d => setTemplates(d?.templates ?? []))
      .catch(() => {});
  }, []);

  // Load history
  useEffect(() => {
    if (showHistory) {
      fetch("/api/vmware/deploy")
        .then(r => r.ok ? r.json() : null)
        .then(d => setHistory(d?.entries ?? []))
        .catch(() => {});
    }
  }, [showHistory]);

  const step2Valid = vmName.trim() && ip.trim() && subnetMask.trim() && gateway.trim();

  const handleDeploy = async () => {
    if (!selectedTemplate) return;
    setDeploying(true);
    setResult(null);
    try {
      const res = await fetch("/api/vmware/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deployTemplateId: selectedTemplate.id,
          vmName: vmName.trim(),
          ip: ip.trim(),
          subnetMask: subnetMask.trim(),
          gateway: gateway.trim(),
          dns: dns.split(",").map(s => s.trim()).filter(Boolean),
          cpuCount: cpuCount || undefined,
          memoryMiB: memoryMiB || undefined,
        }),
      });
      const data = await res.json();
      setResult({ success: data.success, error: data.error, vmMoRef: data.vmMoRef });
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setDeploying(false);
    }
  };

  const resetWizard = () => {
    setStep(1);
    setSelectedTemplate(null);
    setVmName("");
    setIp("");
    setSubnetMask("255.255.255.0");
    setGateway("");
    setDns("8.8.8.8");
    setCpuCount("");
    setMemoryMiB("");
    setResult(null);
  };

  if (showHistory) {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setShowHistory(false)} className="p-1 rounded hover:bg-surface-hover"><ArrowLeft className="w-4 h-4" /></button>
          <h2 className="text-lg font-semibold text-text-primary">Deployment History</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-text-muted">No deployments yet.</p>
        ) : (
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3 bg-surface rounded-lg border border-border">
                {STATUS_ICON[h.status] ?? STATUS_ICON.pending}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{h.vmName}</p>
                  <p className="text-xs text-text-muted">{h.templateName} — {h.ipAddress}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-text-muted">{fmtTime(h.timestamp)}</p>
                  <p className="text-xs text-text-muted">{h.user}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Monitor className="w-5 h-5 text-accent" />
          <h2 className="text-lg font-semibold text-text-primary">Deploy VM from Template</h2>
        </div>
        <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-lg hover:bg-surface">
          <History className="w-3.5 h-3.5" /> History
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {([1, 2, 3, 4] as Step[]).map(s => (
          <div key={s} className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full ${
            s === step ? "bg-accent text-white" : s < step ? "bg-green-100 text-green-700" : "bg-surface text-text-muted border border-border"
          }`}>
            {s < step ? <Check className="w-3 h-3" /> : s}
            <span className="hidden sm:inline">{s === 1 ? "Template" : s === 2 ? "Details" : s === 3 ? "Review" : "Deploy"}</span>
          </div>
        ))}
      </div>

      {/* Step 1 — Template Selection */}
      {step === 1 && (
        <div>
          <p className="text-sm text-text-muted mb-4">Choose a VM deployment template:</p>
          {templates.length === 0 ? (
            <p className="text-sm text-text-muted">No deploy templates configured. An admin can create them in Admin → VMware → Deploy Templates.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedTemplate(t); setStep(2); }}
                  className={`flex items-center gap-3 p-4 rounded-lg border text-left transition-colors ${
                    selectedTemplate?.id === t.id ? "border-accent bg-accent/5" : "border-border hover:border-accent/50 hover:bg-surface"
                  }`}
                >
                  <span className="text-2xl flex-shrink-0">{t.icon || "🖥"}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{t.name}</p>
                    {t.description && <p className="text-xs text-text-muted truncate">{t.description}</p>}
                    <p className="text-xs text-text-muted mt-0.5">{t.vcenterTemplateName}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 2 — VM Details */}
      {step === 2 && selectedTemplate && (
        <div className="max-w-lg space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">VM Hostname *</label>
            <input value={vmName} onChange={e => setVmName(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder="server01" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">IP Address *</label>
            <input value={ip} onChange={e => setIp(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder="172.24.152.50" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Subnet Mask *</label>
              <input value={subnetMask} onChange={e => setSubnetMask(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder="255.255.255.0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Gateway *</label>
              <input value={gateway} onChange={e => setGateway(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder="172.24.152.1" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">DNS Servers (comma-separated)</label>
            <input value={dns} onChange={e => setDns(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder="8.8.8.8, 8.8.4.4" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">CPU Count (override)</label>
              <input type="number" min={1} value={cpuCount} onChange={e => setCpuCount(e.target.value ? parseInt(e.target.value) : "")} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder={selectedTemplate.defaultCpuCount ? String(selectedTemplate.defaultCpuCount) : "Template default"} />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Memory MiB (override)</label>
              <input type="number" min={512} step={512} value={memoryMiB} onChange={e => setMemoryMiB(e.target.value ? parseInt(e.target.value) : "")} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent" placeholder={selectedTemplate.defaultMemoryMiB ? String(selectedTemplate.defaultMemoryMiB) : "Template default"} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface">Back</button>
            <button disabled={!step2Valid} onClick={() => setStep(3)} className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50 flex items-center gap-1.5">
              Next <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 3 && selectedTemplate && (
        <div className="max-w-lg">
          <div className="bg-surface border border-border rounded-lg divide-y divide-border">
            {[
              ["Template", selectedTemplate.name],
              ["vCenter Template", selectedTemplate.vcenterTemplateName],
              ["Customization Spec", selectedTemplate.customizationSpec || "—"],
              ["VM Name", vmName],
              ["IP Address", ip],
              ["Subnet Mask", subnetMask],
              ["Gateway", gateway],
              ["DNS", dns || "—"],
              ["CPU", cpuCount ? String(cpuCount) : "Template default"],
              ["Memory", memoryMiB ? `${memoryMiB} MiB` : "Template default"],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between px-4 py-2.5 text-sm">
                <span className="text-text-muted">{label}</span>
                <span className="font-medium text-text-primary">{val}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface">Back</button>
            <button onClick={() => { setStep(4); handleDeploy(); }} className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" /> Deploy VM
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Progress / Result */}
      {step === 4 && (
        <div className="max-w-lg">
          {deploying && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 animate-spin text-accent" />
              <p className="text-sm text-text-muted">Deploying VM <span className="font-medium text-text-primary">{vmName}</span> from template...</p>
              <p className="text-xs text-text-muted">This may take several minutes. The VM is being cloned and customized in vCenter.</p>
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <div className={`flex items-center gap-3 p-4 rounded-lg border ${
                result.success ? "bg-green-50 border-green-300" : "bg-red-50 border-red-300"
              }`}>
                {result.success ? <CheckCircle className="w-6 h-6 text-green-600" /> : <XCircle className="w-6 h-6 text-red-500" />}
                <div>
                  <p className={`text-sm font-semibold ${result.success ? "text-green-800" : "text-red-800"}`}>
                    {result.success ? "VM deployed successfully!" : "Deployment failed"}
                  </p>
                  {result.error && <p className="text-sm text-red-700 mt-1">{result.error}</p>}
                  {result.success && <p className="text-sm text-green-700 mt-1">{vmName} — {ip}</p>}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={resetWizard} className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover flex items-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5" /> Deploy Another
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
