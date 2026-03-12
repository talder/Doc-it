# Active Directory / LDAP Authentication

doc-it supports optional Active Directory (AD) / LDAP authentication as an alternative or complement to local accounts. When enabled, users can sign in with their AD credentials. doc-it creates a **shadow user** on first successful login and keeps space permissions in sync with AD group memberships on every subsequent login.

---

## Overview

- Supports plain LDAP (port 389) and LDAPS (port 636 + TLS).
- Accepts `sAMAccountName` (plain username) or UPN / email address at login.
- AD accounts are separate from local accounts; an AD user who logs in locally is redirected back to the AD login path.
- The bind password is stored AES-256-GCM encrypted in the SQLite KV store.

---

## Configuration

Configure Active Directory in **Admin → Settings → Active Directory**.

| Field | Description |
|---|---|
| **Enabled** | Toggle AD authentication on/off |
| **Host** | AD / LDAP server hostname or IP |
| **Port** | Default `389` (LDAP) or `636` (LDAPS) |
| **SSL / LDAPS** | Enable for LDAPS connections |
| **Reject unauthorized TLS** | Uncheck only for self-signed certificates in lab environments |
| **Bind DN** | Service account DN used to search the directory (e.g. `CN=svc-docit,OU=Services,DC=example,DC=com`) |
| **Bind password** | Service account password (stored encrypted) |
| **Base DN** | Root search base (e.g. `DC=example,DC=com`) |
| **User search base** | Optional sub-tree to restrict user searches (falls back to Base DN) |
| **Allowed groups** | DNs of AD groups whose members are permitted to log in (leave empty to allow all) |
| **Allowed users** | Specific `sAMAccountName` values that are always permitted regardless of group membership |
| **Group mappings** | Map AD group DNs to doc-it space roles (see [Group Mappings](#group-mappings) below) |

---

## Authentication Flow

1. doc-it binds to the directory with the service account.
2. It searches for the user by `sAMAccountName` or `userPrincipalName` (when an email is entered).
3. It re-binds as the user DN with the supplied password to verify credentials.
4. It checks whether the user belongs to an allowed group (or is in the allowed-users list).
5. On success, it provisions or updates the shadow user and syncs space permissions.

---

## Shadow Users

On the first successful AD login, doc-it creates a local shadow user record with:
- Username derived from `sAMAccountName` (lowercased)
- Display name from `displayName`
- Email from `mail` / `userPrincipalName`
- `authSource: "ad"` flag (prevents local-password login for this account)

Admins are notified by email when a new AD user logs in for the first time.

---

## Group Mappings

Group mappings translate AD group memberships into doc-it space roles. Each mapping has:

| Field | Description |
|---|---|
| **AD group DN** | Full distinguished name of the AD group |
| **Space** | The doc-it space slug to grant access to |
| **Role** | `reader`, `writer`, or `admin` |
| **Is admin** | Grant doc-it super-admin privileges |

Space permissions are re-evaluated on every successful AD login, so changes to AD group membership take effect the next time the user logs in.

---

## Allowed Groups & Users

- **Allowed groups** — if set, only users who are a member of at least one listed group can log in. Users outside these groups receive a "pending approval" message and a shadow user is created with `status: pending`.
- **Allowed users** — individual `sAMAccountName` values always permitted, regardless of group membership.
- If both lists are empty, any user who can authenticate against the directory is permitted.

---

## Testing the Connection

Use the **Test Connection** button in **Admin → Settings → Active Directory** to verify that doc-it can reach the LDAP server and bind with the service account credentials.

---

## Storage

AD configuration is stored in the SQLite KV store under the key `ad.json`. The bind password is stored AES-256-GCM encrypted.
