# doc-it Documentation

**doc-it** is a self-hosted, team-oriented documentation platform built with Next.js. It provides a rich Markdown editor, structured workspaces (Spaces), databases, tagging, document review workflows, NIS2-compliant audit logging, and a full REST API.


---

## Table of Contents

- [Installation](installation.md)
- [Configuration](configuration.md)
- **Features**
  - [Editor](features/editor.md)
  - [Spaces](features/spaces.md)
  - [Documents](features/documents.md)
  - [Templates](features/templates.md)
  - [Databases](features/databases.md)
  - [Tags](features/tags.md)
  - [Review Workflow](features/review-workflow.md)
  - [Distraction-Free Mode](features/distraction-free.md)
  - [Document History](features/document-history.md)
  - [Audit Logging](features/audit-logging.md)
- **API Reference**
  - [Authentication](api/authentication.md)
  - [Spaces](api/spaces.md)
  - [Documents](api/documents.md)
  - [Users](api/users.md)
  - [Databases](api/databases.md)
  - [Categories](api/categories.md)
  - [Audit](api/audit.md)
  - [Settings](api/settings.md)
- **Admin Guide**
  - [Users](admin/users.md)
  - [Spaces](admin/spaces.md)
  - [Service Keys](admin/service-keys.md)
  - [Settings](admin/settings.md)
  - [Audit](admin/audit.md)
- **Security**
  - [NIS2 Compliance](security/nis2-compliance.md)
  - [API Keys](security/api-keys.md)

---

## Quick Start

### 1. Install & run

```bash
git clone <repo-url> doc-it
cd doc-it
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first run you are redirected to the **Setup** wizard.

### 2. Create the first admin account

Fill in a username and password on the setup screen and submit. This account becomes the **super-admin**.

### 3. Create a Space

Go to **Admin → Spaces → New Space**, give it a name, and add users with roles (`reader` / `writer`).

### 4. Start writing

Select your space from the top bar, click **New Document** in the sidebar, choose a category (or create one), and start writing Markdown with the TipTap editor.

---

## Key Concepts

| Concept | Description |
|---|---|
| **Space** | An isolated workspace. Documents, databases, templates, and tags all live inside a space. |
| **Category** | A folder-like hierarchy inside a space to organise documents. |
| **Document** | A Markdown file. Has status (draft / in-review / published), tags, revision history, and metadata. |
| **Template** | A document blueprint with typed fields. Writers fill in the fields when creating a doc from the template. |
| **Database** | A structured spreadsheet-style table with Table / Kanban / Calendar / Gallery views. |
| **Service Key** | A long-lived bearer token for CI/CD or external integrations. |
| **Audit Log** | An immutable, always-on JSONL log of every security-relevant event. Optional syslog forward. |

---

## Screenshot Gallery

| Screen | Preview |
|---|---|
