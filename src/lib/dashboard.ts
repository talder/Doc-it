/**
 * Dashboard module — global link-card dashboard (Dashy-style).
 *
 * Stored globally in config/docit.db under key "dashboard.json".
 * Sections group links visually; links can be targeted to user groups.
 */

import { randomUUID } from "crypto";
import { readJsonConfig, writeJsonConfig } from "./config";
import type { DashboardData, DashboardSection, DashboardLink } from "./types";

const FILE = "dashboard.json";

const EMPTY: DashboardData = { sections: [], links: [] };

export async function readDashboard(): Promise<DashboardData> {
  return readJsonConfig<DashboardData>(FILE, { ...EMPTY, sections: [], links: [] });
}

export async function writeDashboard(data: DashboardData): Promise<void> {
  await writeJsonConfig(FILE, data);
}

// ── Sections ──────────────────────────────────────────────────────────

export async function addSection(fields: {
  name: string;
  icon?: string;
  color?: string;
}): Promise<DashboardSection> {
  const data = await readDashboard();
  const maxOrder = data.sections.reduce((m, s) => Math.max(m, s.order), -1);
  const section: DashboardSection = {
    id: randomUUID(),
    name: fields.name.trim(),
    icon: fields.icon || "",
    color: fields.color || "",
    order: maxOrder + 1,
    collapsed: false,
  };
  data.sections.push(section);
  await writeDashboard(data);
  return section;
}

export async function updateSection(
  id: string,
  fields: { name?: string; icon?: string; color?: string; order?: number; collapsed?: boolean },
): Promise<DashboardSection | null> {
  const data = await readDashboard();
  const idx = data.sections.findIndex((s) => s.id === id);
  if (idx === -1) return null;
  if (fields.name !== undefined) data.sections[idx].name = fields.name.trim();
  if (fields.icon !== undefined) data.sections[idx].icon = fields.icon;
  if (fields.color !== undefined) data.sections[idx].color = fields.color;
  if (fields.order !== undefined) data.sections[idx].order = fields.order;
  if (fields.collapsed !== undefined) data.sections[idx].collapsed = fields.collapsed;
  await writeDashboard(data);
  return data.sections[idx];
}

export async function deleteSection(id: string): Promise<boolean> {
  const data = await readDashboard();
  const before = data.sections.length;
  data.sections = data.sections.filter((s) => s.id !== id);
  // Also remove all links in the deleted section
  data.links = data.links.filter((l) => l.sectionId !== id);
  if (data.sections.length === before) return false;
  await writeDashboard(data);
  return true;
}

// ── Links ─────────────────────────────────────────────────────────────

export async function addLink(fields: {
  title: string;
  url: string;
  sectionId: string;
  description?: string;
  icon?: string;
  color?: string;
  openInNewTab?: boolean;
  visibleToGroups?: string[];
}): Promise<DashboardLink> {
  const data = await readDashboard();
  const sectionLinks = data.links.filter((l) => l.sectionId === fields.sectionId);
  const maxOrder = sectionLinks.reduce((m, l) => Math.max(m, l.order), -1);
  const link: DashboardLink = {
    id: randomUUID(),
    title: fields.title.trim(),
    description: (fields.description || "").trim(),
    url: fields.url.trim(),
    icon: fields.icon || "favicon",
    color: fields.color || "",
    openInNewTab: fields.openInNewTab ?? true,
    sectionId: fields.sectionId,
    order: maxOrder + 1,
    visibleToGroups: fields.visibleToGroups || [],
  };
  data.links.push(link);
  await writeDashboard(data);
  return link;
}

export async function updateLink(
  id: string,
  fields: {
    title?: string;
    description?: string;
    url?: string;
    icon?: string;
    color?: string;
    openInNewTab?: boolean;
    sectionId?: string;
    order?: number;
    visibleToGroups?: string[];
  },
): Promise<DashboardLink | null> {
  const data = await readDashboard();
  const idx = data.links.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  const l = data.links[idx];
  if (fields.title !== undefined) l.title = fields.title.trim();
  if (fields.description !== undefined) l.description = fields.description.trim();
  if (fields.url !== undefined) l.url = fields.url.trim();
  if (fields.icon !== undefined) l.icon = fields.icon;
  if (fields.color !== undefined) l.color = fields.color;
  if (fields.openInNewTab !== undefined) l.openInNewTab = fields.openInNewTab;
  if (fields.sectionId !== undefined) l.sectionId = fields.sectionId;
  if (fields.order !== undefined) l.order = fields.order;
  if (fields.visibleToGroups !== undefined) l.visibleToGroups = fields.visibleToGroups;
  await writeDashboard(data);
  return l;
}

export async function deleteLink(id: string): Promise<boolean> {
  const data = await readDashboard();
  const before = data.links.length;
  data.links = data.links.filter((l) => l.id !== id);
  if (data.links.length === before) return false;
  await writeDashboard(data);
  return true;
}
