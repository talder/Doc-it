# User Groups

User Groups are admin-managed collections of users. They are used to control visibility of dashboard link cards and can be used for other permission-targeting features.

---

## Managing Groups

Groups are managed in **Admin → User Groups**.

### Creating a group

1. Click **+ New Group**.
2. Enter a **Name** and optional **Description**.
3. Click **Save**.

### Adding members

1. Open a group.
2. In the **Members** field, type a username and select it from the autocomplete list.
3. Click **Save**.

Members are stored as a list of doc-it usernames. Both local and AD shadow users can be added.

### Editing a group

Click a group name to open its editor. Update the name, description, or member list and click **Save**.

### Deleting a group

Click the **Delete** button on a group. This removes the group and all its membership records. Any dashboard links restricted to the deleted group will become visible to all users.

---

## Using Groups

### Dashboard link visibility

When creating or editing a dashboard link card, you can select one or more groups in the **Visible to groups** field. Only users who are members of at least one of those groups will see the card. Leave the field empty to show the card to all logged-in users.

See [Dashboard](../features/dashboard.md) for more detail.

---

## Storage

User group data is stored in the SQLite KV store under the key `user-groups.json`.
