/**
 * LDAP authentication for helpdesk portal users.
 *
 * Uses Node.js net/tls sockets for lightweight LDAP bind/search
 * without requiring a native dependency. Falls back gracefully
 * if the LDAP server is unreachable.
 */

import { readConfig } from "./helpdesk";

export interface LdapUser {
  username: string;
  email: string;
  fullName: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Authenticate a portal user via LDAP bind.
 * Returns user attributes on success, null on failure.
 * Requires `ldapjs` to be installed as an optional dependency.
 */
export async function authenticateLdap(username: string, password: string): Promise<LdapUser | null> {
  const cfg = await readConfig();
  const ldap = cfg.ldapConfig;
  if (!ldap?.enabled) return null;

  try {
    // Dynamic import — ldapjs is optional; skip if not installed
    let ldapjs: any;
    try { ldapjs = await import("ldapjs" as string); } catch { return null; }

    const client = ldapjs.createClient({ url: ldap.url, timeout: 5000, connectTimeout: 5000 });

    // Bind with service account first
    const { decryptField } = await import("./crypto");
    const bindPassword = decryptField(ldap.bindPasswordEncrypted);

    await new Promise<void>((resolve, reject) => {
      client.bind(ldap.bindDn, bindPassword, (err: any) => {
        if (err) reject(err); else resolve();
      });
    });

    // Search for the user
    const searchFilter = ldap.searchFilter.replace("{{username}}", username);
    const searchResult = await new Promise<LdapUser | null>((resolve, reject) => {
      client.search(ldap.searchBase, { filter: searchFilter, scope: "sub", attributes: [ldap.usernameAttr, ldap.emailAttr, ldap.fullNameAttr] }, (err: any, res: any) => {
        if (err) return reject(err);
        let found: LdapUser | null = null;
        res.on("searchEntry", (entry: any) => {
          const attrs: Array<{ type: string; values: string[] }> = entry.attributes || [];
          const get = (name: string) => attrs.find((a) => a.type === name)?.values?.[0] ?? "";
          found = {
            username: get(ldap.usernameAttr) || username,
            email: get(ldap.emailAttr) || "",
            fullName: get(ldap.fullNameAttr) || username,
          };
        });
        res.on("error", (err: any) => reject(err));
        res.on("end", () => resolve(found));
      });
    });

    if (!searchResult) {
      client.unbind(() => {});
      return null;
    }

    // Re-bind as the found user to verify password
    const userDn = `${ldap.usernameAttr}=${username},${ldap.searchBase}`;
    await new Promise<void>((resolve, reject) => {
      client.bind(userDn, password, (err: any) => {
        if (err) reject(err); else resolve();
      });
    });

    client.unbind(() => {});
    return searchResult;
  } catch (err) {
    console.error("[helpdesk-ldap] Auth error:", (err as Error).message);
    return null;
  }
}
