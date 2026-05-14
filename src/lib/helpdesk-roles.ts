/**
 * Helpdesk Agent Roles — role-based access control.
 *
 * Roles:
 * - hd_admin:    Full access to all helpdesk features and admin settings
 * - hd_agent:    Can view/edit tickets in their assigned groups
 * - hd_readonly: Can view tickets but not modify
 *
 * Role is determined by:
 * 1. System admin → always hd_admin
 * 2. Member of any helpdesk group → hd_agent
 * 3. Everyone else → hd_readonly (if they can access helpdesk at all)
 *
 * Group visibility: hd_agent users only see tickets assigned to their groups
 * unless they are hd_admin.
 */

import { readConfig } from "./helpdesk";
import type { HdGroup, Ticket } from "./helpdesk";

export type HelpdeskRole = "hd_admin" | "hd_agent" | "hd_readonly";

export interface HelpdeskAccess {
  role: HelpdeskRole;
  groups: HdGroup[];
  groupIds: string[];
  canEdit: boolean;
  canAdmin: boolean;
}

/**
 * Determine the helpdesk role and accessible groups for a user.
 */
export async function getHelpdeskAccess(username: string, isSystemAdmin: boolean): Promise<HelpdeskAccess> {
  if (isSystemAdmin) {
    const cfg = await readConfig();
    return {
      role: "hd_admin",
      groups: cfg.groups,
      groupIds: cfg.groups.map((g) => g.id),
      canEdit: true,
      canAdmin: true,
    };
  }

  const cfg = await readConfig();
  const memberGroups = cfg.groups.filter((g) => g.members.includes(username));

  if (memberGroups.length > 0) {
    return {
      role: "hd_agent",
      groups: memberGroups,
      groupIds: memberGroups.map((g) => g.id),
      canEdit: true,
      canAdmin: false,
    };
  }

  return {
    role: "hd_readonly",
    groups: [],
    groupIds: [],
    canEdit: false,
    canAdmin: false,
  };
}

/**
 * Filter tickets based on agent's group membership.
 * hd_admin sees all tickets. hd_agent sees tickets in their groups or assigned to them.
 */
export function filterTicketsByAccess(tickets: Ticket[], access: HelpdeskAccess, username: string): Ticket[] {
  if (access.role === "hd_admin") return tickets;

  return tickets.filter((t) =>
    // Assigned directly to this agent
    t.assignedTo === username ||
    // Assigned to one of their groups
    (t.assignedGroup && access.groupIds.includes(t.assignedGroup)) ||
    // Requester is this user
    t.requester === username,
  );
}
