# API — Users

All endpoints require admin authentication.

---

## GET /api/users

List all users.

**Response `200`**
```json
[
  { "username": "alice", "isAdmin": false, "createdAt": "2025-01-01T..." }
]
```

---

## POST /api/users

Create a new user.

**Request body**
```json
{ "username": "alice", "password": "secret", "isAdmin": false }
```

---

## PUT /api/users/:username

Update a user's password or admin status.

**Request body**
```json
{ "password": "newpassword", "isAdmin": true }
```

---

## DELETE /api/users/:username

Delete a user. The super-admin account cannot be deleted.
