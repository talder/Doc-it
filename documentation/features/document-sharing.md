# Document Sharing

Writers can share any document with people outside their doc-it workspace using a **token-based share link**. The recipient does not need a doc-it account.

---

## Creating a Share Link

1. Open the document you want to share.
2. Click the `…` (More actions) menu → **Share**.
3. Configure the share options (see below).
4. Click **Create Share Link**.
5. Copy the generated URL and send it to the recipient.

The link points to `/share/<token>` and works in any browser without authentication.

---

## Share Options

| Option | Description |
|---|---|
| **Mode** | `Read only` — recipient can read the document. `Read & Write` — recipient can also edit and save. |
| **Password** | Optional. The recipient must enter this password before viewing the document. Leave blank for an open link. |
| **Expiry** | How long the link remains valid: `Never`, `1 hour`, `24 hours`, `7 days`, `30 days`, or a custom date/time. |

---

## Shared Pages Overview

Click the **Share** icon (↗) in the topbar to see all active share links for the current space.

The overview shows:

| Column | Description |
|---|---|
| Document | Name of the shared document |
| Category | Category the document belongs to |
| Mode | `Read` or `Read & Write` |
| 🔒 | Padlock icon — link is password-protected |
| ⏰ | Clock icon + expiry date — link expires at this time |
| Created by / date | Who created the link and when |

---

## Revoking a Share Link

In the Shared Pages Overview, hover over a row and click the **trash** icon to revoke the link immediately. The token is invalidated and any recipient who tries to open the URL will receive a "not found" error.

---

## Storage

Share tokens are stored in the SQLite KV store inside the space's configuration. Each token record includes the document reference, mode, optional password hash, optional expiry timestamp, and creator.
