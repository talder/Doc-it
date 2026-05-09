/**
 * Change Log module — ITSM-grade operational change tracking.
 *
 * Entries are mutable until status = "Closed" | "Rejected".
 * Each update is tracked in entry.history[].
 * High/Critical changes trigger email notifications.
 * Forwards closed changes to syslog.
 */

import os from "os";
import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import { getAuditConfig } from "./audit";

// ── Types ────────────────────────────────────────────────────────────

export type ChangeCategory = string;

export const DEFAULT_CATEGORIES: string[] = [
  "Disk", "Network", "Security", "Software", "Hardware", "Configuration", "Other",
];

export type ChangeType = "Standard" | "Normal" | "Emergency";

export type ChangeRisk = "Low" | "Medium" | "High" | "Critical";

/**
 * Full lifecycle status.
 * Standard:   Draft → Approved → Implementing → Closed
 * Normal:     Draft → Submitted → Under Review → CAB Approval → Approved → Implementing → Closed
 * Emergency:  Draft → Submitted → Approved → Implementing → Closed
 * Any:        → Rejected | Failed | Rolled Back
 */
export type ChangeLifecycleStatus =
  | "Draft" | "Submitted" | "Under Review" | "CAB Approval"
  | "Approved" | "Implementing" | "Closed" | "Rejected"
  | "Failed" | "Rolled Back"
  // Legacy statuses (backward compat with pre-v0.3 entries)
  | "Planned" | "In Progress" | "Completed";

export interface ChangeApproval {
  username: string;
  role?: string;
  decision: "Pending" | "Approved" | "Rejected";
  comment?: string;
  decidedAt?: string;
}

export interface ChangeHistoryEntry {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  by: string;
  at: string;
}

export interface ChangeLinkedDoc {
  name: string;
  category: string;
  spaceSlug: string;
}

export interface ChangeLogEntry {
  id: string;               // CHG-000001
  changeType: ChangeType;
  date: string;             // YYYY-MM-DD
  time?: string;            // HH:MM (optional)
  author: string;
  approvedBy?: string;      // legacy single approver (free text)
  approvals?: ChangeApproval[];
  system: string;
  affectedAssetIds?: string[];
  category: ChangeCategory;
  description: string;
  impact: string;
  backoutPlan?: string;
  risk: ChangeRisk;
  riskAnswers?: Record<string, boolean>;
  status: ChangeLifecycleStatus;
  plannedStart?: string;
  plannedEnd?: string;
  downtimeMinutes?: number;
  pirNotes?: string;
  ccEmails?: string[];
  relatedCrId?: string;
  rollbackOf?: string;
  linkedDoc?: ChangeLinkedDoc;
  closedAt?: string;
  history?: ChangeHistoryEntry[];
  createdAt: string;
}

export interface ChangeTemplate {
  id: string;
  name: string;
  changeType: ChangeType;
  category: string;
  risk: ChangeRisk;
  description: string;
  impact: string;
  backoutPlan: string;
}

export interface FreezePeriod {
  id: string;
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  reason: string;
}

export interface ChangeLogSettings {
  retentionYears: number;
  categories?: string[];
  cabMembers?: string[];         // usernames who are CAB
  freezePeriods?: FreezePeriod[];
  templates?: ChangeTemplate[];
}

export interface ChangeLogData {
  nextNumber: number;
  entries: ChangeLogEntry[];
}

// ── Risk questionnaire ────────────────────────────────────────────────

export interface RiskQuestion {
  id: string;
  question: string;
  weight: number;
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: "production",  question: "Does this affect a production system?",          weight: 2 },
  { id: "downtime",    question: "Will this cause service downtime?",               weight: 2 },
  { id: "rollback_hard", question: "Is rollback complex or time-consuming (>1h)?", weight: 2 },
  { id: "many_users",  question: "Does this affect more than 10 users?",           weight: 1 },
  { id: "security",    question: "Does this involve firewall, auth, or security?", weight: 2 },
  { id: "first_time",  question: "Has this exact change never been done before?",  weight: 1 },
];

export function calculateRiskFromAnswers(answers: Record<string, boolean>): ChangeRisk {
  const score = RISK_QUESTIONS.reduce((s, q) => s + (answers[q.id] ? q.weight : 0), 0);
  if (score >= 7) return "Critical";
  if (score >= 5) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

// ── Lifecycle ─────────────────────────────────────────────────────────

const TERMINAL: Set<ChangeLifecycleStatus> = new Set(["Closed", "Rejected", "Completed"]);

export function isTerminal(status: ChangeLifecycleStatus): boolean {
  return TERMINAL.has(status);
}

/** Return which statuses this change can transition to next. */
export function allowedTransitions(entry: ChangeLogEntry): ChangeLifecycleStatus[] {
  const { status, changeType } = entry;
  switch (status) {
    case "Draft":
      if (changeType === "Standard") return ["Approved", "Rejected"];
      return ["Submitted", "Rejected"];
    case "Submitted":
      if (changeType === "Emergency") return ["Approved", "Rejected"];
      return ["Under Review", "Rejected"];
    case "Under Review":
      return ["CAB Approval", "Approved", "Rejected"];
    case "CAB Approval":
      return ["Approved", "Rejected"];
    case "Approved":
      return ["Implementing", "Rejected"];
    case "Implementing":
      return ["Closed", "Failed", "Rolled Back"];
    // Legacy
    case "Planned":       return ["Approved", "Implementing", "Rejected"];
    case "In Progress":   return ["Closed", "Failed", "Rolled Back"];
    case "Completed":     return [];
    default:              return [];
  }
}

// ── Constants ────────────────────────────────────────────────────────

const CHANGELOG_FILE  = "changelog.json";
const SETTINGS_FILE   = "changelog-settings.json";
const DEFAULT_SETTINGS: ChangeLogSettings = { retentionYears: 5 };
const EMPTY: ChangeLogData = { nextNumber: 1, entries: [] };

function retentionCutoff(retentionYears: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - retentionYears);
  return d.toISOString().slice(0, 10);
}

const FACILITY_MAP: Record<string, number> = {
  kern:0,user:1,mail:2,daemon:3,auth:4,syslog:5,lpr:6,news:7,uucp:8,
  cron:9,authpriv:10,ftp:11,local0:16,local1:17,local2:18,local3:19,
  local4:20,local5:21,local6:22,local7:23,
};

// ── Storage ──────────────────────────────────────────────────────────

export async function readChangeLog(): Promise<ChangeLogData> {
  return readJsonConfig<ChangeLogData>(CHANGELOG_FILE, { ...EMPTY, entries: [] });
}
async function writeChangeLog(data: ChangeLogData): Promise<void> {
  await writeJsonConfig(CHANGELOG_FILE, data);
}

export async function readChangeLogSettings(): Promise<ChangeLogSettings> {
  return readJsonConfig<ChangeLogSettings>(SETTINGS_FILE, { ...DEFAULT_SETTINGS });
}
export async function saveChangeLogSettings(s: Partial<ChangeLogSettings> & { retentionYears: number }): Promise<void> {
  const current = await readChangeLogSettings();
  await writeJsonConfig(SETTINGS_FILE, { ...current, ...s });
}

export async function getChangeCategories(): Promise<string[]> {
  const s = await readChangeLogSettings();
  return (s.categories && s.categories.length > 0) ? s.categories : [...DEFAULT_CATEGORIES];
}

export async function getKnownSystems(): Promise<string[]> {
  const data = await readChangeLog();
  return [...new Set(data.entries.map(e => e.system).filter(Boolean))].sort();
}

// ── Create ────────────────────────────────────────────────────────────

export interface CreateChangeFields {
  changeType: ChangeType;
  date: string;
  time?: string;
  author: string;
  system: string;
  affectedAssetIds?: string[];
  category: ChangeCategory;
  description: string;
  impact: string;
  backoutPlan?: string;
  risk: ChangeRisk;
  riskAnswers?: Record<string, boolean>;
  status?: ChangeLifecycleStatus;
  plannedStart?: string;
  plannedEnd?: string;
  downtimeMinutes?: number;
  ccEmails?: string[];
  relatedCrId?: string;
  rollbackOf?: string;
  linkedDoc?: ChangeLinkedDoc;
}

export async function addChangeLogEntry(fields: CreateChangeFields): Promise<ChangeLogEntry> {
  const data = await readChangeLog();
  const num = data.nextNumber || 1;
  const id = `CHG-${String(num).padStart(6, "0")}`;

  // Standard changes are auto-approved
  const status: ChangeLifecycleStatus =
    fields.status ?? (fields.changeType === "Standard" ? "Approved" : "Draft");

  const entry: ChangeLogEntry = {
    id,
    changeType: fields.changeType,
    date: fields.date,
    ...(fields.time ? { time: fields.time } : {}),
    author: fields.author,
    system: fields.system,
    ...(fields.affectedAssetIds?.length ? { affectedAssetIds: fields.affectedAssetIds } : {}),
    category: fields.category,
    description: fields.description,
    impact: fields.impact,
    ...(fields.backoutPlan ? { backoutPlan: fields.backoutPlan } : {}),
    risk: fields.risk,
    ...(fields.riskAnswers ? { riskAnswers: fields.riskAnswers } : {}),
    status,
    ...(fields.plannedStart ? { plannedStart: fields.plannedStart } : {}),
    ...(fields.plannedEnd ? { plannedEnd: fields.plannedEnd } : {}),
    ...(fields.downtimeMinutes ? { downtimeMinutes: fields.downtimeMinutes } : {}),
    ...(fields.ccEmails?.length ? { ccEmails: fields.ccEmails } : {}),
    ...(fields.relatedCrId ? { relatedCrId: fields.relatedCrId } : {}),
    ...(fields.rollbackOf ? { rollbackOf: fields.rollbackOf } : {}),
    ...(fields.linkedDoc ? { linkedDoc: fields.linkedDoc } : {}),
    approvals: [],
    history: [],
    createdAt: new Date().toISOString(),
  };

  data.entries.push(entry);
  data.nextNumber = num + 1;

  const settings = await readChangeLogSettings();
  const cutoff = retentionCutoff(settings.retentionYears);
  data.entries = data.entries.filter(e => e.date >= cutoff);

  await writeChangeLog(data);

  // Notifications
  sendChangeToSyslog(entry).catch(() => {});
  if (entry.risk === "High" || entry.risk === "Critical") {
    notifyHighRiskChange(entry, settings).catch(() => {});
  }
  if (entry.changeType === "Emergency") {
    notifyEmergencyChange(entry, settings).catch(() => {});
  }

  return entry;
}

// ── Update (mutable until terminal) ──────────────────────────────────

export interface UpdateChangeFields {
  status?: ChangeLifecycleStatus;
  pirNotes?: string;
  approvedBy?: string;
  plannedStart?: string;
  plannedEnd?: string;
  downtimeMinutes?: number;
  backoutPlan?: string;
  ccEmails?: string[];
  affectedAssetIds?: string[];
  relatedCrId?: string;
}

export async function updateChangeLogEntry(
  id: string,
  updates: UpdateChangeFields,
  actor: string,
): Promise<ChangeLogEntry | null> {
  const data = await readChangeLog();
  const idx = data.entries.findIndex(e => e.id === id);
  if (idx === -1) return null;

  const entry = data.entries[idx];
  if (isTerminal(entry.status)) return null; // immutable once closed/rejected

  const now = new Date().toISOString();
  const hist: ChangeHistoryEntry[] = entry.history || [];

  for (const [k, v] of Object.entries(updates)) {
    const old = (entry as Record<string, unknown>)[k];
    if (JSON.stringify(old) !== JSON.stringify(v)) {
      hist.push({ field: k, oldValue: old, newValue: v, by: actor, at: now });
      (entry as Record<string, unknown>)[k] = v;
    }
  }

  // Set closedAt when closing
  if (updates.status && isTerminal(updates.status) && !entry.closedAt) {
    entry.closedAt = now;
    sendChangeToSyslog(entry).catch(() => {});
  }

  entry.history = hist;
  data.entries[idx] = entry;
  await writeChangeLog(data);

  // Notify CC + status change emails
  if (updates.status) {
    notifyStatusChange(entry, updates.status, actor).catch(() => {});
  }

  return entry;
}

// ── Approvals ─────────────────────────────────────────────────────────

export async function addApproval(
  id: string,
  username: string,
  role: string | undefined,
  decision: "Approved" | "Rejected",
  comment: string | undefined,
): Promise<ChangeLogEntry | null> {
  const data = await readChangeLog();
  const idx = data.entries.findIndex(e => e.id === id);
  if (idx === -1) return null;

  const entry = data.entries[idx];
  if (isTerminal(entry.status)) return null;

  const now = new Date().toISOString();
  if (!entry.approvals) entry.approvals = [];

  // Remove any existing approval from this user and add new one
  entry.approvals = entry.approvals.filter(a => a.username !== username);
  entry.approvals.push({ username, role, decision, comment, decidedAt: now });

  if (!entry.history) entry.history = [];
  entry.history.push({ field: "approval", oldValue: null, newValue: { username, decision }, by: username, at: now });

  data.entries[idx] = entry;
  await writeChangeLog(data);
  return entry;
}

// ── Conflict detection ────────────────────────────────────────────────

export async function detectConflicts(
  system: string,
  plannedStart: string | undefined,
  plannedEnd: string | undefined,
  excludeId?: string,
): Promise<ChangeLogEntry[]> {
  if (!plannedStart && !plannedEnd) return [];
  const data = await readChangeLog();
  return data.entries.filter(e => {
    if (e.id === excludeId) return false;
    if (e.system.toLowerCase() !== system.toLowerCase()) return false;
    if (isTerminal(e.status)) return false;
    if (!e.plannedStart && !e.plannedEnd) return false;
    // Overlap check
    const eStart = e.plannedStart || e.date + "T00:00:00";
    const eEnd   = e.plannedEnd   || e.date + "T23:59:59";
    const nStart = plannedStart || "";
    const nEnd   = plannedEnd   || "";
    if (nEnd && eStart > nEnd) return false;
    if (nStart && eEnd < nStart) return false;
    return true;
  });
}

// ── Freeze period check ───────────────────────────────────────────────

export async function isInFreezePeriod(date: string, changeType: ChangeType): Promise<FreezePeriod | null> {
  if (changeType === "Emergency") return null; // Emergency bypasses freeze
  const settings = await readChangeLogSettings();
  for (const fp of settings.freezePeriods || []) {
    if (date >= fp.from && date <= fp.to) return fp;
  }
  return null;
}

// ── Filter ────────────────────────────────────────────────────────────

export function filterChangeLog(
  entries: ChangeLogEntry[],
  opts: { q?: string; from?: string; to?: string; category?: string; system?: string; risk?: string; status?: string; changeType?: string },
): ChangeLogEntry[] {
  let r = entries;
  if (opts.from) r = r.filter(e => e.date >= opts.from!);
  if (opts.to)   r = r.filter(e => e.date <= opts.to!);
  if (opts.category)   r = r.filter(e => e.category === opts.category);
  if (opts.system)     r = r.filter(e => e.system.toLowerCase() === opts.system!.toLowerCase());
  if (opts.risk)       r = r.filter(e => e.risk === opts.risk);
  if (opts.status)     r = r.filter(e => e.status === opts.status);
  if (opts.changeType) r = r.filter(e => (e.changeType || "Normal") === opts.changeType);
  if (opts.q) {
    const q = opts.q.toLowerCase();
    r = r.filter(e =>
      e.id.toLowerCase().includes(q) || e.system.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) || e.impact.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) || e.author.toLowerCase().includes(q) ||
      (e.approvedBy || "").toLowerCase().includes(q) || (e.backoutPlan || "").toLowerCase().includes(q),
    );
  }
  return r;
}

// ── Email notifications ───────────────────────────────────────────────

async function getAdminRecipients(): Promise<Set<string>> {
  const { sendMail: _s, getSmtpConfig } = await import("./email");
  const { getUsers } = await import("./auth");
  const cfg = await getSmtpConfig();
  if (!cfg.host || !cfg.from) return new Set();
  const users = await getUsers();
  const set = new Set<string>();
  for (const u of users) { if (u.isAdmin && u.email) set.add(u.email); }
  if (cfg.adminEmail) set.add(cfg.adminEmail);
  return set;
}

async function notifyHighRiskChange(entry: ChangeLogEntry, settings: ChangeLogSettings): Promise<void> {
  try {
    const { sendMail, getSmtpConfig } = await import("./email");
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.from) return;
    const recipients = await getAdminRecipients();
    // Also add CAB members (if configured)
    const { getUsers } = await import("./auth");
    const users = await getUsers();
    for (const cabUser of (settings.cabMembers || [])) {
      const u = users.find(x => x.username === cabUser);
      if (u?.email) recipients.add(u.email);
    }
    if (recipients.size === 0) return;
    const rc = entry.risk === "Critical" ? "#dc2626" : "#d97706";
    const subject = `[Doc-it] ${entry.risk} Risk Change: ${entry.id} — ${entry.system}`;
    const html = `<div style="font-family:sans-serif;max-width:620px;margin:0 auto"><div style="background:${rc};color:white;padding:16px 20px;border-radius:8px 8px 0 0"><h2 style="margin:0;font-size:18px">⚠️ ${entry.risk} Risk Change (${entry.changeType}): ${entry.id}</h2></div><div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px"><table style="border-collapse:collapse;width:100%;font-size:14px"><tr><td style="padding:6px 0;color:#6b7280;width:130px">System</td><td style="padding:6px 0;font-weight:600">${entry.system}</td></tr><tr><td style="padding:6px 0;color:#6b7280">Category</td><td>${entry.category}</td></tr><tr><td style="padding:6px 0;color:#6b7280">Status</td><td>${entry.status}</td></tr><tr><td style="padding:6px 0;color:#6b7280">Author</td><td>${entry.author}</td></tr>${entry.plannedStart ? `<tr><td style="padding:6px 0;color:#6b7280">Planned</td><td>${new Date(entry.plannedStart).toLocaleString()}</td></tr>` : ""}</table><p style="margin:16px 0 4px;font-weight:600;color:#374151">Description</p><p style="margin:0 0 8px;background:#f9fafb;border-left:3px solid #e5e7eb;padding:8px 12px">${entry.description}</p>${entry.backoutPlan ? `<p style="margin:8px 0 4px;font-weight:600;color:#374151">Backout Plan</p><p style="margin:0 0 16px;background:#fef9f0;border-left:3px solid #fbbf24;padding:8px 12px">${entry.backoutPlan}</p>` : ""}<p style="margin:0;font-size:12px;color:#9ca3af">Logged at ${new Date(entry.createdAt).toLocaleString()}</p></div></div>`;
    await Promise.all([...recipients].map(to => sendMail(to, subject, html).catch(() => {})));
  } catch (e) { console.error("[changelog] notifyHighRiskChange:", e); }
}

async function notifyEmergencyChange(entry: ChangeLogEntry, settings: ChangeLogSettings): Promise<void> {
  try {
    const { sendMail, getSmtpConfig } = await import("./email");
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.from) return;
    const recipients = await getAdminRecipients();
    if (recipients.size === 0) return;
    const subject = `[Doc-it] 🚨 EMERGENCY Change: ${entry.id} — ${entry.system}`;
    const html = `<div style="font-family:sans-serif;max-width:620px;margin:0 auto"><div style="background:#7c3aed;color:white;padding:16px 20px;border-radius:8px 8px 0 0"><h2 style="margin:0;font-size:18px">🚨 Emergency Change Submitted: ${entry.id}</h2><p style="margin:4px 0 0;opacity:.85">Requires immediate review</p></div><div style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:20px"><table style="border-collapse:collapse;width:100%;font-size:14px"><tr><td style="padding:6px 0;color:#6b7280;width:130px">System</td><td style="padding:6px 0;font-weight:600">${entry.system}</td></tr><tr><td style="padding:6px 0;color:#6b7280">Risk</td><td>${entry.risk}</td></tr><tr><td style="padding:6px 0;color:#6b7280">Author</td><td>${entry.author}</td></tr></table><p style="margin:16px 0 4px;font-weight:600">Description</p><p style="margin:0 0 16px;background:#f9fafb;border-left:3px solid #7c3aed;padding:8px 12px">${entry.description}</p><p style="margin:0;font-size:12px;color:#9ca3af">Logged at ${new Date(entry.createdAt).toLocaleString()}</p></div></div>`;
    await Promise.all([...recipients].map(to => sendMail(to, subject, html).catch(() => {})));
  } catch (e) { console.error("[changelog] notifyEmergencyChange:", e); }
}

async function notifyStatusChange(entry: ChangeLogEntry, newStatus: string, actor: string): Promise<void> {
  try {
    const ccList = entry.ccEmails || [];
    if (ccList.length === 0) return;
    const { sendMail, getSmtpConfig } = await import("./email");
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.from) return;
    const subject = `[Doc-it] ${entry.id} status → ${newStatus}`;
    const html = `<div style="font-family:sans-serif;max-width:500px"><p>Change <strong>${entry.id}</strong> for <strong>${entry.system}</strong> has been updated to <strong>${newStatus}</strong> by ${actor}.</p><p style="font-size:12px;color:#9ca3af">Doc-it Change Management</p></div>`;
    await Promise.all(ccList.map(to => sendMail(to, subject, html).catch(() => {})));
  } catch {}
}

// ── Syslog ────────────────────────────────────────────────────────────

async function sendChangeToSyslog(entry: ChangeLogEntry): Promise<void> {
  const config = await getAuditConfig();
  if (!config.syslog.enabled || !config.syslog.host) return;
  const cfg = config.syslog;
  const facilityNum = FACILITY_MAP[cfg.facility] ?? 16;
  const pri = facilityNum * 8 + 5;
  const hostname = cfg.hostname || os.hostname() || "-";
  const appName = cfg.appName || "doc-it";
  const host = cfg.host.replace(/^https?:\/\//i, "").replace(/\/+$/, "").trim();
  const msg = `[CHANGE] ${entry.id} | Type: ${entry.changeType} | System: ${entry.system} | Category: ${entry.category} | Status: ${entry.status} | Risk: ${entry.risk} | Author: ${entry.author}`;
  const message = `<${pri}>1 ${entry.createdAt} ${hostname} ${appName} - change.v2 - ${msg}`;
  const buf = Buffer.from(message, "utf-8");
  if (cfg.protocol === "udp") await sendUdp(buf, host, cfg.port);
  else await sendTcp(buf, host, cfg.port);
}

function sendUdp(buf: Buffer, host: string, port: number): Promise<void> {
  return new Promise(resolve => {
    import("dgram").then(dgram => {
      const c = dgram.createSocket("udp4");
      c.send(buf, 0, buf.length, port, host, () => { c.close(); resolve(); });
      c.on("error", () => { c.close(); resolve(); });
    }).catch(() => resolve());
  });
}
function sendTcp(buf: Buffer, host: string, port: number): Promise<void> {
  return new Promise(resolve => {
    import("net").then(net => {
      const s = net.createConnection(port, host, () => {
        s.write(Buffer.concat([Buffer.from(`${buf.length} `), buf]));
        s.end(); resolve();
      });
      s.setTimeout(5000);
      s.on("error", () => { s.destroy(); resolve(); });
      s.on("timeout", () => { s.destroy(); resolve(); });
    }).catch(() => resolve());
  });
}

// Re-export for backward compat with vmware.ts
export { addChangeLogEntry as default };
