# Crash Logging

doc-it includes an automatic crash logging system that captures unhandled errors on both the server and client side. Crash logs are written to local JSONL files and can be browsed in the admin panel.

---

## What Gets Captured

### Server-side

- **Uncaught exceptions** (`process.on("uncaughtException")`) — logged as `fatal`
- **Unhandled promise rejections** (`process.on("unhandledRejection")`) — logged as `error`

These handlers are registered at server startup via `instrumentation-node.ts`.

### Client-side

- **React rendering errors** — caught by the Next.js `global-error.tsx` error boundary
- **Unhandled JavaScript errors** — caught by `window.addEventListener("error")`
- **Unhandled promise rejections** — caught by `window.addEventListener("unhandledrejection")`

Client errors are reported to the server via `POST /api/crash-logs/report` and stored alongside server crashes.

---

## Log Format

Each crash is a single JSON line:

```json
{
  "id": "a1b2c3d4-...",
  "timestamp": "2025-06-01T12:34:56.789Z",
  "source": "server",
  "level": "fatal",
  "message": "Cannot read properties of undefined (reading 'slug')",
  "stack": "TypeError: Cannot read properties of undefined...\n    at handler (/src/app/api/...",
  "url": "/api/spaces/my-space/docs",
  "method": "GET",
  "userAgent": "Mozilla/5.0 ...",
  "details": { "type": "uncaughtException" }
}
```

| Field | Description |
|---|---|
| `id` | Unique UUID |
| `timestamp` | ISO 8601 timestamp |
| `source` | `server` or `client` |
| `level` | `fatal` (process-level crash) or `error` (unhandled rejection / client error) |
| `message` | Error message |
| `stack` | Stack trace (if available) |
| `url` | Request URL (server) or page URL (client) |
| `method` | HTTP method (server-side only) |
| `userAgent` | Browser or client user agent string |
| `details` | Additional context (e.g. `{ "type": "uncaughtException" }`) |

---

## Log Files

Crash logs rotate daily: `logs/crash-YYYY-MM-DD.jsonl`

Old files are automatically deleted when they exceed the configured **retention period** (default 90 days). Cleanup runs once per day.

```
logs/
├── audit-2025-06-01.jsonl
├── audit-2025-06-02.jsonl
├── crash-2025-06-01.jsonl
├── crash-2025-06-02.jsonl
└── ...
```

---

## Email Notifications

When a crash is logged and SMTP is configured (with an `adminEmail` set), an email is sent automatically to the admin containing:

- Error level and source
- Timestamp
- Error message
- URL and method (if available)
- Full stack trace

Emails use the subject format: `[Doc-it FATAL] server crash: <message>` or `[Doc-it ERROR] client crash: <message>`.

---

## Client Error Reporting Endpoint

Client-side errors are reported via:

```
POST /api/crash-logs/report
Content-Type: application/json

{
  "message": "Unhandled client error",
  "stack": "Error: ...\n    at ...",
  "url": "https://docs.example.com/my-space"
}
```

This endpoint:
- Requires **no authentication** (errors can occur before login)
- Is **rate-limited** to 20 requests per minute per IP address
- Truncates `message` to 2000 characters and `stack` to 8000 characters

---

## Viewing Crash Logs

Go to **Admin → Crash Logs** to browse all crash entries. See the [Admin — Crash Logs](../admin/crash-logs.md) guide for details.

---

## Storage

Crash logs are stored as plain-text JSONL files in the `logs/` directory. They are **not encrypted** (unlike audit logs), as they contain operational debugging information rather than security-sensitive data. Crash logs are included in backup archives.
