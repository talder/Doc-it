import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readCertStore, buildCertTree, canAccessItem } from "@/lib/certificates";
import { readJsonConfig } from "@/lib/config";
import type { UserGroupsData } from "@/lib/types";

/**
 * GET /api/certificates
 * Returns PKI items the current user has access to.
 * Non-admins see only items in their allowedUsers/allowedGroups.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const store = await readCertStore();

  // Resolve user's group memberships
  let userGroupIds: string[] = [];
  if (!user.isAdmin) {
    const groupData = await readJsonConfig<UserGroupsData>("user-groups.json", { groups: [] });
    userGroupIds = groupData.groups
      .filter((g) => g.members.includes(user.username))
      .map((g) => g.id);
  }

  const safeKeys = store.keys
    .filter((k) => canAccessItem(k, user, userGroupIds))
    .map(({ pemEncrypted: _p, ...rest }) => rest);

  const csrs = store.csrs.filter((c) => canAccessItem(c, user, userGroupIds));
  const certs = store.certs.filter((c) => canAccessItem(c, user, userGroupIds));
  const tree = buildCertTree(certs);

  return NextResponse.json({ keys: safeKeys, csrs, certs, crls: store.crls, templates: store.templates, tree });
}
