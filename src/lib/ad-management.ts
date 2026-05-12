/**
 * Active Directory management — server-only LDAP operations.
 *
 * Uses the same ldapts client and service account from ad.ts.
 * All write operations require LDAPS (SSL) — enforced here.
 */

import { randomBytes } from "crypto";
import { Attribute, Change, Client, type ClientOptions } from "ldapts";
import { getAdConfig } from "./ad";
import { decryptField } from "./crypto";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getClient(): Promise<{ client: Client; baseDn: string }> {
  const cfg = await getAdConfig();
  if (!cfg.enabled || !cfg.host) throw new Error("AD not configured");
  if (!cfg.bindDn) throw new Error("AD bind DN not configured");

  const scheme = cfg.ssl ? "ldaps" : "ldap";
  const url = `${scheme}://${cfg.host}:${cfg.port}`;
  const options: ClientOptions = { url, connectTimeout: 5000, timeout: 10000 };
  if (cfg.ssl && !cfg.tlsRejectUnauthorized) {
    options.tlsOptions = { rejectUnauthorized: false };
  }

  const client = new Client(options);
  const bindPassword = cfg.bindPasswordEncrypted
    ? await decryptField(cfg.bindPasswordEncrypted)
    : "";
  if (!bindPassword) throw new Error("AD bind password not configured");
  await client.bind(cfg.bindDn, bindPassword);

  return { client, baseDn: cfg.userSearchBase || cfg.baseDn };
}

function escapeLdap(value: string): string {
  return value
    .replace(/\\/g, "\\5c").replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28").replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}

function generatePassword(length = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const bytes = randomBytes(length);
  let pw = "";
  // Ensure at least one of each class
  pw += upper[bytes[0] % upper.length];
  pw += lower[bytes[1] % lower.length];
  pw += digits[bytes[2] % digits.length];
  pw += special[bytes[3] % special.length];
  for (let i = 4; i < length; i++) pw += all[bytes[i] % all.length];
  // Shuffle
  return pw.split("").sort(() => Math.random() - 0.5).join("");
}

function extractCn(dn: string): string {
  const match = dn.match(/^CN=([^,]+)/i);
  return match ? match[1] : dn;
}

function extractOu(dn: string): string {
  const parts = dn.split(",").filter(p => p.toUpperCase().startsWith("OU="));
  return parts.map(p => p.replace(/^OU=/i, "")).join(" / ");
}

// UAC flags
const UAC_ACCOUNT_DISABLE = 0x0002;
const UAC_LOCKOUT = 0x0010;
const UAC_NORMAL_ACCOUNT = 0x0200;

function isEnabled(uac: number): boolean { return (uac & UAC_ACCOUNT_DISABLE) === 0; }
function isLocked(uac: number): boolean { return (uac & UAC_LOCKOUT) !== 0; }

// ── User operations ──────────────────────────────────────────────────────────

export async function searchAdUsers(query: string, limit = 50) {
  const { client, baseDn } = await getClient();
  try {
    const filter = `(&(objectClass=user)(objectCategory=person)(|(sAMAccountName=*${escapeLdap(query)}*)(displayName=*${escapeLdap(query)}*)(mail=*${escapeLdap(query)}*)))`;
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub", filter, sizeLimit: limit,
      attributes: ["dn", "sAMAccountName", "displayName", "mail", "userAccountControl", "lastLogonTimestamp", "memberOf"],
    });
    return searchEntries.map(e => {
      const uac = Number(e.userAccountControl ?? 0);
      const memberOf = Array.isArray(e.memberOf) ? e.memberOf : e.memberOf ? [e.memberOf] : [];
      return {
        sAMAccountName: String(e.sAMAccountName ?? ""),
        displayName: String(e.displayName ?? ""),
        email: String(e.mail ?? ""),
        enabled: isEnabled(uac),
        locked: isLocked(uac),
        lastLogon: e.lastLogonTimestamp ? new Date(Number(e.lastLogonTimestamp) / 10000 - 11644473600000).toISOString() : undefined,
        groupCount: memberOf.length,
        dn: e.dn,
      };
    });
  } finally { await client.unbind().catch(() => {}); }
}

export async function getAdUser(sam: string) {
  const { client, baseDn } = await getClient();
  try {
    const filter = `(&(objectClass=user)(sAMAccountName=${escapeLdap(sam)}))`;
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub", filter, sizeLimit: 1,
      attributes: ["dn", "sAMAccountName", "displayName", "mail", "userAccountControl", "lastLogonTimestamp", "memberOf", "lockoutTime"],
    });
    if (!searchEntries.length) return null;
    const e = searchEntries[0];
    const uac = Number(e.userAccountControl ?? 0);
    const memberOf = Array.isArray(e.memberOf) ? e.memberOf.map(String) : e.memberOf ? [String(e.memberOf)] : [];
    return {
      sAMAccountName: String(e.sAMAccountName ?? ""),
      displayName: String(e.displayName ?? ""),
      email: String(e.mail ?? ""),
      enabled: isEnabled(uac),
      locked: isLocked(uac) || (Number(e.lockoutTime ?? 0) > 0),
      lastLogon: e.lastLogonTimestamp ? new Date(Number(e.lastLogonTimestamp) / 10000 - 11644473600000).toISOString() : undefined,
      groupCount: memberOf.length,
      groups: memberOf,
      dn: e.dn,
    };
  } finally { await client.unbind().catch(() => {}); }
}

export async function resetAdPassword(sam: string): Promise<string> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Password reset requires LDAPS (SSL). Enable SSL in AD configuration.");

  const user = await getAdUser(sam);
  if (!user) throw new Error("User not found");

  const password = generatePassword();
  const { client } = await getClient();
  try {
    // AD requires the password in UTF-16LE enclosed in quotes
    const encodedPw = Buffer.from(`"${password}"`, "utf16le");
    await client.modify(user.dn!, new Change({
      operation: "replace",
      modification: new Attribute({ type: "unicodePwd", values: [encodedPw] }),
    }));
    // Force password change at next logon
    await client.modify(user.dn!, new Change({
      operation: "replace",
      modification: new Attribute({ type: "pwdLastSet", values: ["0"] }),
    }));
    return password;
  } finally { await client.unbind().catch(() => {}); }
}

export async function setAdAccountEnabled(sam: string, enabled: boolean): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Account management requires LDAPS (SSL).");
  const user = await getAdUser(sam);
  if (!user) throw new Error("User not found");

  const { client } = await getClient();
  try {
    const currentUac = await getUserUac(client, user.dn!);
    const newUac = enabled
      ? (currentUac & ~UAC_ACCOUNT_DISABLE)
      : (currentUac | UAC_ACCOUNT_DISABLE);
    await client.modify(user.dn!, new Change({
      operation: "replace",
      modification: new Attribute({ type: "userAccountControl", values: [String(newUac)] }),
    }));
  } finally { await client.unbind().catch(() => {}); }
}

export async function unlockAdAccount(sam: string): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Account management requires LDAPS (SSL).");
  const user = await getAdUser(sam);
  if (!user) throw new Error("User not found");

  const { client } = await getClient();
  try {
    await client.modify(user.dn!, new Change({
      operation: "replace",
      modification: new Attribute({ type: "lockoutTime", values: ["0"] }),
    }));
  } finally { await client.unbind().catch(() => {}); }
}

async function getUserUac(client: Client, dn: string): Promise<number> {
  const { searchEntries } = await client.search(dn, {
    scope: "base", filter: "(objectClass=*)", attributes: ["userAccountControl"],
  });
  return Number(searchEntries[0]?.userAccountControl ?? UAC_NORMAL_ACCOUNT);
}

// ── Group operations ─────────────────────────────────────────────────────────

export async function searchAdGroups(query: string, limit = 50) {
  const { client, baseDn } = await getClient();
  try {
    const filter = `(&(objectClass=group)(|(cn=*${escapeLdap(query)}*)(sAMAccountName=*${escapeLdap(query)}*)))`;
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub", filter, sizeLimit: limit,
      attributes: ["dn", "cn", "description", "member"],
    });
    return searchEntries.map(e => {
      const members = Array.isArray(e.member) ? e.member : e.member ? [e.member] : [];
      return {
        dn: e.dn,
        name: String(e.cn ?? ""),
        description: String(e.description ?? ""),
        memberCount: members.length,
      };
    });
  } finally { await client.unbind().catch(() => {}); }
}

export async function getAdGroupMembers(groupDn: string) {
  const { client } = await getClient();
  try {
    const { searchEntries } = await client.search(groupDn, {
      scope: "base", filter: "(objectClass=group)", attributes: ["member"],
    });
    if (!searchEntries.length) return [];
    const members = Array.isArray(searchEntries[0].member)
      ? searchEntries[0].member.map(String)
      : searchEntries[0].member ? [String(searchEntries[0].member)] : [];

    // Resolve each member DN to get display info
    const results = [];
    for (const dn of members.slice(0, 200)) { // cap at 200
      try {
        const { searchEntries: me } = await client.search(dn, {
          scope: "base", filter: "(objectClass=*)",
          attributes: ["sAMAccountName", "displayName", "objectClass"],
        });
        if (me.length) {
          const oc = Array.isArray(me[0].objectClass) ? me[0].objectClass.map(String) : [];
          const type = oc.includes("computer") ? "computer" : oc.includes("group") ? "group" : "user";
          results.push({
            dn, sAMAccountName: String(me[0].sAMAccountName ?? ""),
            displayName: String(me[0].displayName ?? ""), type,
          });
        }
      } catch { results.push({ dn, sAMAccountName: extractCn(dn), displayName: "", type: "unknown" }); }
    }
    return results;
  } finally { await client.unbind().catch(() => {}); }
}

export async function addAdGroupMember(groupDn: string, userDn: string): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Group management requires LDAPS (SSL).");
  const { client } = await getClient();
  try {
    await client.modify(groupDn, new Change({ operation: "add", modification: new Attribute({ type: "member", values: [userDn] }) }));
  } finally { await client.unbind().catch(() => {}); }
}

export async function removeAdGroupMember(groupDn: string, userDn: string): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Group management requires LDAPS (SSL).");
  const { client } = await getClient();
  try {
    await client.modify(groupDn, new Change({ operation: "delete", modification: new Attribute({ type: "member", values: [userDn] }) }));
  } finally { await client.unbind().catch(() => {}); }
}

// ── Computer operations ──────────────────────────────────────────────────────

export async function searchAdComputers(query: string, limit = 50) {
  const { client, baseDn } = await getClient();
  try {
    const filter = `(&(objectClass=computer)(cn=*${escapeLdap(query)}*))`;
    const { searchEntries } = await client.search(baseDn, {
      scope: "sub", filter, sizeLimit: limit,
      attributes: ["dn", "cn", "operatingSystem", "lastLogonTimestamp", "userAccountControl"],
    });
    const now = Date.now();
    const STALE_MS = 90 * 24 * 60 * 60 * 1000;
    return searchEntries.map(e => {
      const uac = Number(e.userAccountControl ?? 0);
      const lastLogonTs = e.lastLogonTimestamp ? Number(e.lastLogonTimestamp) / 10000 - 11644473600000 : 0;
      const lastLogon = lastLogonTs > 0 ? new Date(lastLogonTs).toISOString() : undefined;
      return {
        dn: e.dn,
        name: String(e.cn ?? ""),
        os: e.operatingSystem ? String(e.operatingSystem) : undefined,
        lastLogon,
        enabled: isEnabled(uac),
        ou: extractOu(e.dn),
        stale: lastLogonTs > 0 && (now - lastLogonTs) > STALE_MS,
      };
    });
  } finally { await client.unbind().catch(() => {}); }
}

export async function setAdComputerEnabled(dn: string, enabled: boolean): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Computer management requires LDAPS (SSL).");
  const { client } = await getClient();
  try {
    const { searchEntries } = await client.search(dn, {
      scope: "base", filter: "(objectClass=computer)", attributes: ["userAccountControl"],
    });
    if (!searchEntries.length) throw new Error("Computer not found");
    const uac = Number(searchEntries[0].userAccountControl ?? 0);
    const newUac = enabled ? (uac & ~UAC_ACCOUNT_DISABLE) : (uac | UAC_ACCOUNT_DISABLE);
    await client.modify(dn, new Change({ operation: "replace", modification: new Attribute({ type: "userAccountControl", values: [String(newUac)] }) }));
  } finally { await client.unbind().catch(() => {}); }
}

export async function deleteAdComputer(dn: string): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("Computer management requires LDAPS (SSL).");
  const { client } = await getClient();
  try {
    await client.del(dn);
  } finally { await client.unbind().catch(() => {}); }
}

export async function moveAdObject(dn: string, newParentOu: string): Promise<void> {
  const cfg = await getAdConfig();
  if (!cfg.ssl) throw new Error("AD management requires LDAPS (SSL).");
  const { client } = await getClient();
  try {
    const cn = dn.split(",")[0]; // "CN=name"
    await client.modifyDN(dn, `${cn},${newParentOu}`);
  } finally { await client.unbind().catch(() => {}); }
}
