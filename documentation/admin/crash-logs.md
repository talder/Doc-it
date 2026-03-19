# Admin — Crash Logs

The **Crash Logs** tab (`/admin?tab=crash-logs`) shows a filterable, paginated list of all server-side and client-side crash events.

---

## Filter Bar

| Filter | Description |
|---|---|
| From / To | Date range filter |
| Source | `All`, `Server`, or `Client` |
| Level | `All`, `Fatal`, or `Error` |
| Search | Free-text search across message, stack trace, and URL |

Click **Search** to apply. Results are paginated at 50 per page.

---

## Crash Entry List

Each entry shows:
- **Level badge** — `FATAL` (red) or `ERROR` (orange)
- **Source badge** — `server` (purple) or `client` (blue)
- **Timestamp** — when the crash occurred
- **Message** — truncated error message

Click an entry to expand it and see:
- **URL** — the request URL (server) or page URL (client) where the error occurred
- **Method** — HTTP method (server-side only)
- **User Agent** — browser or client user agent string
- **Details** — additional context (e.g. `uncaughtException` or `unhandledRejection`)
- **Stack trace** — full stack trace in a scrollable code block

---

## Log Files on Disk

```
logs/
├── crash-2025-06-01.jsonl
├── crash-2025-06-02.jsonl
└── ...
```

Each line is a JSON object. See [Crash Logging feature docs](../features/crash-logging.md) for the full field reference.

---

## Retention

Crash log files older than **90 days** are automatically deleted. Cleanup runs once per day when the server is running.

---

## Email Notifications

When SMTP is configured with an `adminEmail` in **Admin → Settings → SMTP**, the admin receives an email for every crash event. No additional configuration is needed — crash email alerts are always active when SMTP is set up.
