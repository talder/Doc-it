# API — Settings

All settings endpoints require **admin** authentication.

---

## GET /api/settings/smtp

Return the current SMTP configuration.

**Response `200`**
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "noreply@example.com",
  "pass": "",
  "from": "doc-it <noreply@example.com>",
  "adminEmail": "admin@example.com"
}
```

The `pass` field is always returned empty for security; it is write-only.

---

## PUT /api/settings/smtp

Update the SMTP configuration.

**Request body** (all fields optional)
```json
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "noreply@example.com",
  "pass": "secret",
  "from": "doc-it <noreply@example.com>",
  "adminEmail": "admin@example.com"
}
```

---

## GET /api/settings/audit

Return the current audit configuration.

**Response `200`**
```json
{
  "enabled": true,
  "localFile": { "retentionDays": 365 },
  "syslog": {
    "enabled": false,
    "host": "",
    "port": 514,
    "protocol": "udp",
    "facility": "local0",
    "appName": "doc-it",
    "hostname": ""
  }
}
```

---

## PUT /api/settings/audit

Update the audit configuration.

**Request body** (all fields optional)
```json
{
  "localFile": { "retentionDays": 90 },
  "syslog": {
    "enabled": true,
    "host": "syslog.internal",
    "port": 514,
    "protocol": "udp"
  }
}
```

---

## GET /api/admin/service-keys *(admin only)*

List all service keys.

**Response `200`**
```json
{
  "keys": [
    {
      "id": "sk_...",
      "name": "CI Pipeline",
      "prefix": "sk_abc",
      "permissions": { "*": "reader" },
      "createdBy": "tim",
      "createdAt": "2025-01-01T...",
      "expiresAt": null,
      "lastUsedAt": null
    }
  ]
}
```

---

## POST /api/admin/service-keys *(admin only)*

Create a new service key.

**Request body**
```json
{
  "name": "CI Pipeline",
  "permissions": { "engineering": "reader", "docs": "writer" },
  "expiresAt": "2026-01-01T00:00:00Z"
}
```

Use `{ "*": "reader" }` to grant the key access to all current and future spaces with the given role.

**Response `200`**
```json
{
  "key": { "id": "sk_...", "name": "CI Pipeline", "prefix": "sk_abc" },
  "secret": "sk_abc_<full-token>"
}
```

The `secret` is shown **once only**.

---

## DELETE /api/admin/service-keys/:id *(admin only)*

Revoke a service key immediately.
