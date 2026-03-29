/**
 * Client-safe asset helpers — pure functions with no server dependencies.
 * Safe to import from "use client" components.
 *
 * Mirrors the oncall.ts / oncall-shared.ts split pattern.
 */

import type { CmdbItem, LifecycleWorkflow, LifecycleTransition, Location } from "./cmdb";

export function getValidTransitions(asset: CmdbItem, workflows: LifecycleWorkflow[]): LifecycleTransition[] {
  const workflow = workflows.find((w) => w.id === asset.workflowId);
  if (!workflow || !asset.lifecycleStateId) return [];
  return workflow.transitions.filter((t) => t.fromStateId === asset.lifecycleStateId);
}

export function getLifecycleStateName(stateId: string | undefined, workflows: LifecycleWorkflow[]): string {
  if (!stateId) return "Unknown";
  for (const w of workflows) {
    const s = w.states.find((s) => s.id === stateId);
    if (s) return s.name;
  }
  return stateId;
}

export function getLifecycleStateColor(stateId: string | undefined, workflows: LifecycleWorkflow[]): string {
  if (!stateId) return "#6b7280";
  for (const w of workflows) {
    const s = w.states.find((s) => s.id === stateId);
    if (s) return s.color;
  }
  return "#6b7280";
}

export function getLocationPath(locationId: string | undefined, locations: Location[]): string {
  if (!locationId) return "";
  const parts: string[] = [];
  let current = locations.find((l) => l.id === locationId);
  while (current) {
    parts.unshift(current.name);
    current = current.parentId ? locations.find((l) => l.id === current!.parentId) : undefined;
  }
  return parts.join(" > ");
}
