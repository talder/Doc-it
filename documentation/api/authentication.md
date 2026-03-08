# API — Authentication

All API endpoints use **session cookies** for browser-based access. For programmatic access, use a [Service Key](../security/api-keys.md) or [Personal API Key](../security/api-keys.md) passed as `Authorization: Bearer <token>`.

---

## POST /api/auth/login

Log in with username and password. Sets a session cookie on success.

**Request body**
```json
{ "username": "alice", "password": "secret" }
```

**Response `200`**
```json
{ "user": { "username": "alice", "isAdmin": false, "preferences": {} } }
```

**Response `401`**
```json
{ "error": "Invalid credentials" }
```

---

## POST /api/auth/logout

Destroy the current session. Returns `200` with `{ "ok": true }`.

---

## GET /api/auth/me

Return the currently authenticated user, or redirect info.

**Response `200` (authenticated)**
```json
{ "user": { "username": "alice", "isAdmin": false } }
```

**Response `200` (no admin account yet)**
```json
{ "needsSetup": true }
```

**Response `200` (not logged in)**
```json
{ "user": null }
```

---

## POST /api/auth/setup

Create the first admin account. Only works when no users exist.

**Request body**
```json
{ "username": "admin", "password": "strongpassword" }
```

**Response `200`**
```json
{ "user": { "username": "admin", "isAdmin": true } }
```

---

## POST /api/auth/register

Register a new non-admin user (requires existing session of any authenticated user, OR can be open depending on configuration).

**Request body**
```json
{ "username": "bob", "password": "secret" }
```

---

## GET /api/auth/profile

Return the full profile of the current user including preferences.

---

## PUT /api/auth/profile

Update the current user's profile (display name, preferences, password change).

**Request body** (all fields optional)
```json
{
  "fullName": "Alice Smith",
  "email": "alice@example.com",
  "preferences": {
    "theme": "dark",
    "accentColor": "#6366f1",
    "fontSize": "medium",
    "pageWidth": "wide",
    "alwaysShowToc": true,
    "editorLineSpacing": "relaxed",
    "favorites": []
  },
  "currentPassword": "old",
  "newPassword": "new"
}
```

---

## GET /api/auth/admins

Return a list of admin usernames and emails (used to show the "contact an admin" screen to users with no space access). Public endpoint.

---

## POST /api/auth/api-keys

Create a personal API key for the authenticated user.

**Request body**
```json
{ "name": "My CI key", "expiresAt": "2026-01-01T00:00:00Z" }
```

**Response `200`**
```json
{ "key": { "id": "...", "name": "My CI key", "prefix": "dk_..." }, "secret": "dk_..." }
```

The `secret` is shown **once only**. Store it securely.

---

## DELETE /api/auth/api-keys/:id

Revoke a personal API key.

---

## Authentication Headers

For all API requests from scripts or CI, pass the key as:

```
Authorization: Bearer dk_<your-key>
```
