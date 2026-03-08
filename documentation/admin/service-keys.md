# Admin — Service Keys

Service keys are long-lived bearer tokens for machine-to-machine access — ideal for CI/CD pipelines, scripts, and external integrations.


---

## Creating a Service Key

1. Go to **Admin → Service Keys**.
2. Fill in the form:
   - **Name** — a descriptive label (e.g., "GitHub Actions CI").
   - **Expiry date** (optional) — leave blank for a non-expiring key.
   - **Permissions** — choose one of:
     - **All spaces** — grant the key access to every space with a single role.
     - **Per space** — select individual spaces and roles.
3. Click **Create**.

The full secret token is shown **once** in a reveal dialog. Copy it immediately — it cannot be retrieved again.

---

## Secret Format

```
sk_<prefix>_<random>
```

Use it in API requests as:

```http
Authorization: Bearer sk_<prefix>_<random>
```

---

## Permissions

Service keys use the same role system as users:

| Role | Access |
|---|---|
| `reader` | Read-only access to documents, databases, and space metadata |
| `writer` | Full read + write access |

Use `{ "*": "writer" }` in the API body to grant access to all spaces.

---

## Viewing Keys

The list shows:
- Key name and prefix (e.g., `sk_abc`)
- Created by
- Creation date
- Expiry date (if set)
- Last used date

---

## Revoking a Key

Click **Revoke** next to a key. The key is immediately invalidated and any requests using it will receive `401 Unauthorized`.

---

## Security Best Practices

- Treat service key secrets like passwords — store them in CI/CD secret stores, not in code.
- Use expiring keys for short-lived automations.
- Use the minimum necessary role (`reader` vs `writer`).
- Revoke keys when a project or integration is decommissioned.
