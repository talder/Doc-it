/**
 * Client-safe exports from the changelog module.
 * No server-only imports (no nodemailer, net, auth, etc.).
 * Import from here in "use client" components.
 */

// ── Types (re-exported for client use) ───────────────────────────────

export type ChangeCategory = string;
export type ChangeType = "Standard" | "Normal" | "Emergency";
export type ChangeRisk = "Low" | "Medium" | "High" | "Critical";

export type ChangeLifecycleStatus =
  | "Draft" | "Submitted" | "Under Review" | "CAB Approval"
  | "Approved" | "Implementing" | "Closed" | "Rejected"
  | "Failed" | "Rolled Back"
  | "Planned" | "In Progress" | "Completed"; // legacy

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
  id: string;
  changeType: ChangeType;
  date: string;
  time?: string;
  author: string;
  approvedBy?: string;
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
  from: string;
  to: string;
  reason: string;
}

// ── Risk questionnaire (client-safe) ─────────────────────────────────

export interface RiskQuestion {
  id: string;
  question: string;
  weight: number;
}

export const RISK_QUESTIONS: RiskQuestion[] = [
  { id: "production",    question: "Does this affect a production system?",          weight: 2 },
  { id: "downtime",      question: "Will this cause service downtime?",               weight: 2 },
  { id: "rollback_hard", question: "Is rollback complex or time-consuming (>1h)?",   weight: 2 },
  { id: "many_users",    question: "Does this affect more than 10 users?",           weight: 1 },
  { id: "security",      question: "Does this involve firewall, auth, or security?", weight: 2 },
  { id: "first_time",    question: "Has this exact change never been done before?",  weight: 1 },
];

export function calculateRiskFromAnswers(answers: Record<string, boolean>): ChangeRisk {
  const score = RISK_QUESTIONS.reduce((s, q) => s + (answers[q.id] ? q.weight : 0), 0);
  if (score >= 7) return "Critical";
  if (score >= 5) return "High";
  if (score >= 3) return "Medium";
  return "Low";
}

// ── Lifecycle helpers (client-safe) ───────────────────────────────────

const TERMINAL: Set<ChangeLifecycleStatus> = new Set(["Closed", "Rejected", "Completed"]);

export function isTerminal(status: ChangeLifecycleStatus): boolean {
  return TERMINAL.has(status);
}

export function allowedTransitions(entry: ChangeLogEntry): ChangeLifecycleStatus[] {
  const { status, changeType } = entry;
  switch (status) {
    case "Draft":
      return changeType === "Standard" ? ["Approved", "Rejected"] : ["Submitted", "Rejected"];
    case "Submitted":
      return changeType === "Emergency" ? ["Approved", "Rejected"] : ["Under Review", "Rejected"];
    case "Under Review":
      return ["CAB Approval", "Approved", "Rejected"];
    case "CAB Approval":
      return ["Approved", "Rejected"];
    case "Approved":
      return ["Implementing", "Rejected"];
    case "Implementing":
      return ["Closed", "Failed", "Rolled Back"];
    case "Planned":      return ["Approved", "Implementing", "Rejected"];
    case "In Progress":  return ["Closed", "Failed", "Rolled Back"];
    case "Completed":    return [];
    default:             return [];
  }
}
