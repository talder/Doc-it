# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev          # Start Next.js dev server (Turbopack)
npm run build        # Production build
npm start            # Start production server
npm run lint         # ESLint
```

Requires Node.js 24+ (see `.nvmrc`) and npm 10+.

There is no test framework configured in this project. There are no unit tests.

## Architecture Overview

Doc-it is a self-hosted documentation platform built as a single **Next.js 16 App Router** application. It uses **no external database server** — all persistent state lives on disk:

- **Documents**: Markdown files with YAML frontmatter stored in `docs/{space}/{category}/{doc}.md`. Templates use `.mdt` extension. Frontmatter is parsed/serialized via `src/lib/frontmatter.ts` using `gray-matter`.
- **Configuration**: SQLite KV store at `config/docit.db` (WAL mode, via `better-sqlite3`). Config entries are keyed by filename (e.g. `users.json`, `spaces.json`) and store JSON values. On first boot, existing JSON files in `config/` are auto-migrated into SQLite (`src/lib/config.ts`).
- **Enhanced Tables**: Per-space JSON files in `docs/{space}/.databases/{id}.db.json`.
- **Audit logs**: Encrypted JSONL files at `logs/audit-YYYY-MM-DD.jsonl` with HMAC integrity chain.
- **Backups**: AES-256-GCM encrypted `.tar.gz.enc` archives.

### Key Patterns

- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).
- **Auth flow**: Cookie-based sessions (`docit-session`) or Bearer tokens (user keys `dk_u_*`, service keys `dk_s_*`). Auth is checked in API routes via `getCurrentUser()` from `src/lib/auth.ts` or `requireSpaceRole()` from `src/lib/permissions.ts`. Route protection for pages is handled by `src/proxy.ts` (middleware-like redirect to `/login`).
- **API routes**: All under `src/app/api/`. Space-scoped routes use the `[slug]` dynamic segment. Most routes call `requireSpaceRole(slug, "reader"|"writer"|"admin")` for authorization.
- **Encryption**: Field-level AES-256-GCM encryption via `src/lib/crypto.ts`. Key stored in `config/docit.db` under `secret-key.json` or injected via `SECRET_FIELD_KEY` env var. Used for TOTP secrets, journal entries, audit logs, and backups.
- **Editor**: TipTap/ProseMirror editor loaded via `next/dynamic` (no SSR). Extensions live in `src/components/extensions/`. Slash commands, callouts, Excalidraw, Draw.io, collapsible lists, drag handle, tags, mentions, enhanced tables, and template placeholders are all custom extensions.
- **Instrumentation**: `src/instrumentation.ts` bootstraps Node.js-only logic (backup scheduler) via dynamic import to avoid Edge bundler issues.

### Module Responsibilities (`src/lib/`)

- `config.ts` — SQLite singleton, KV read/write, directory helpers, blob table init, `getDb()` export, `getBlobstoreDir()`
- `blobstore.ts` — global content-addressed attachment store (`config/blobstore/{sha256}`); SHA-256 dedup, PDF text extraction via pdfjs-dist, `attachment_refs` + `blobs` table operations, aggressive migration
- `shutdown.ts` — in-memory pub/sub for SIGTERM graceful shutdown signalling (used by `/api/system/events`)
- `notification-bus.ts` — in-memory pub/sub that broadcasts new notifications to SSE clients immediately without polling
- `auth.ts` — bcrypt hashing, sessions, current user resolution
- `permissions.ts` — space RBAC (`requireSpaceRole`)
- `notifications.ts` — in-app notifications (JSON files per user) + email delivery + real-time SSE push via `notification-bus`
- `helpdesk.ts` / `helpdesk-portal.ts` — ticketing system and portal user auth (separate from main auth)
- `audit.ts` — NIS2 audit logging with encryption and syslog forwarding
- `crypto.ts` — AES-256-GCM field encryption and key rotation
- `enhanced-table.ts` — enhanced table CRUD (JSON files per space)
- `journal.ts` — encrypted personal and space journals
- `cmdb.ts` — CMDB module (CI registry, types, relationships, services, compliance, vulnerabilities, change requests, SLA, cost, templates, maintenance windows, scanning)
- `cmdb-shared.ts` — client-safe CMDB helpers (lifecycle state, location path)
- `cmdb-scanner.ts` — network discovery scanner (TCP port probe, DNS reverse lookup, device type heuristics)
- `changelog.ts` — change log module
- `oncall.ts` — on-call report CRUD, filtering, weekly email (server-only; imports `config.ts`)
- `oncall-shared.ts` — client-safe on-call types and pure helpers (no server deps; safe to import from `"use client"` components)
- `csv.ts` — client-safe CSV parse/generate/download utilities for enhanced table import/export

### Component Organization (`src/components/`)

- `Editor.tsx` — main TipTap editor with bubble menu, markdown import/export via `marked`+`turndown`
- `sidebar/Sidebar.tsx` — main sidebar with categories, docs, tags, enhanced tables, favorites
- `extensions/` — all custom TipTap node/mark extensions
- `enhanced-table/` — enhanced table views (table, kanban, gallery, calendar), row edit modal, query block node view
- `helpdesk/` — helpdesk UI components (ticket panel, form designer, portal page designer, SLA/rule editors)
- `modals/` — modal dialogs for CRUD operations

### Security Headers

Security headers (CSP, HSTS, X-Frame-Options, etc.) are configured in `next.config.ts` via `headers()`. `canvas` and `better-sqlite3` are declared as `serverExternalPackages`. Turbopack aliases `canvas` to `empty-module.js` to avoid client-side bundling errors.

### MCP Server (`mcp-server.mjs`)

Standalone MCP (Model Context Protocol) server for AI assistant integration (Warp, Claude, Cursor). Uses stdio transport. Connects to Doc-it via REST API with a `DOCIT_API_KEY`. Exposes 14 tools:

- **Spaces**: `list_spaces`
- **Documents**: `list_docs`, `read_doc`, `create_doc`, `update_doc`, `search_docs`
- **Enhanced Tables**: `list_tables`, `read_table`, `query_table`, `create_row`, `update_row`, `delete_row`
- **Tags**: `list_tags`
- **System**: `get_version`

Run: `DOCIT_URL=http://localhost:3000 DOCIT_API_KEY=dk_u_... node mcp-server.mjs`

See `documentation/features/mcp-server.md` for full setup guide.

## Data Directories (gitignored)

- `config/` — SQLite DB, avatars, `blobstore/` (content-addressed attachments)
- `docs/` — document storage; `attachments/` subdirs are legacy (migrate to blobstore)
- `archive/` — archived documents
- `history/` — revision snapshots
- `logs/` — audit logs
