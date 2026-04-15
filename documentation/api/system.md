# API — System

---

## GET /api/version

Get the Doc-it server version. No authentication required.

**Response `200`**
```json
{ "version": "0.2.40" }
```

---

## GET /api/system/events

Server-Sent Events (SSE) stream. Delivers real-time events to connected browser clients:

- **`shutdown`** — Server is shutting down. Includes a `deadline` ISO timestamp for the countdown.
- **`notification`** — In-app notification for the authenticated user.
- **Keepalive** — `: keepalive` comment every 25 seconds.

**Response** `200` with `Content-Type: text/event-stream`

**Example events:**
```
event: shutdown
data: {"reason":"Server is shutting down for update","deadline":"2026-04-15T06:30:00.000Z"}

event: notification
data: {"message":"You were mentioned in Domain Controllers","docName":"Domain Controllers","category":"windows"}
```

---

## POST /api/admin/shutdown

Trigger a 60-second shutdown countdown for all connected clients. **Admin or service key required.**

After the countdown:
1. All sessions are invalidated
2. Clients are redirected to `/login`
3. The service can be safely stopped

**Response `200`**
```json
{
  "status": "ok",
  "message": "Shutdown countdown started. All clients notified. Sessions will be invalidated in 60 seconds.",
  "countdownSeconds": 60
}
```

Use this from an installer or script before stopping the service:
```bash
curl -X POST http://localhost:3000/api/admin/shutdown \
  -H "Authorization: Bearer dk_s_your_service_key"
sleep 70
systemctl stop doc-it
```
