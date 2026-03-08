# Admin — Users

The **Users** tab in the Admin panel (`/admin?tab=users`) shows all registered users and lets admins create, update, and delete accounts.


---

## User List

The table shows:
- Username
- Admin status (shield icon for admins, gold crown for the super-admin)
- Account creation date

---

## Creating a User

Click **Create User** to expand the form.


| Field | Description |
|---|---|
| Username | Lowercase letters, numbers, hyphens |
| Password | Minimum 8 characters recommended |
| Admin | Toggle to grant admin privileges |

Click **Create** to save. The user can log in immediately.

---

## Changing Password or Admin Status

Click the **Edit** icon next to a user to update their password or toggle admin status.

---

## Deleting a User

Click the **Delete** (trash) icon. The super-admin account cannot be deleted.

Deleting a user does not delete their documents. Their username remains in space permissions and history records.

---

## Super-Admin

The first account created via the setup wizard is the **super-admin** (`isSuperAdmin: true`). This account:
- Cannot be deleted
- Cannot have admin status removed
- Always has access to all spaces
