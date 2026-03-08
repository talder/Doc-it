# API Keys & Service Keys

doc-it provides two types of programmatic access tokens.

---

## Personal API Keys

Personal API keys are tied to a specific user account and inherit that user's permissions.

### Creating a Personal API Key

1. Go to your **Profile** (`/profile`).
2. Scroll to the **API Keys** section.
3. Enter a name and optional expiry date.
4. Click **Create**. Copy the secret immediately — it is shown only once.

### Usage

```http
GET /api/spaces/engineering/docs
Authorization: Bearer dk_<your-key>
```

### Revoking

Go to **Profile → API Keys** and click **Revoke** next to the key.

---

## Service Keys (Admin)

Service keys are admin-managed tokens designed for CI/CD pipelines and server-to-server integrations. They are **not tied to a user account**.

### Differences from Personal Keys

| | Personal API Key | Service Key |
|---|---|---|
| Tied to user | Yes | No |
| Created by | Any user (for themselves) | Admins only |
| Permissions | Same as the user | Explicit per-space role map |
| Visible in admin panel | No | Yes |
| Supports wildcard spaces | No | Yes (`"*": "reader"`) |

See [Admin — Service Keys](../admin/service-keys.md) for creation and management instructions.

---

## Token Format

| Type | Prefix |
|---|---|
| Personal API Key | `dk_` |
| Service Key | `sk_` |

---

## Security Recommendations

- **Never commit tokens to source control.** Use environment variables or secret managers.
- **Use expiring tokens** wherever possible.
- **Grant minimum necessary permissions** — prefer `reader` role unless writes are needed.
- **Audit key usage** — the `actor` field in audit logs shows the key prefix for service key requests.
- **Revoke immediately** when a key is no longer needed or may be compromised.

---

## Authentication Flow

```
Client → Authorization: Bearer <token> → API route
  ↓
Middleware checks session cookie first
  ↓
If no session, tries bearer token match:
  - Check personal API keys (all users)
  - Check service keys
  ↓
If matched: inject user/key context, check role for resource
  ↓
If not matched: 401 Unauthorized
```
