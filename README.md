# Doc-it

A self-hosted, Confluence-like documentation platform built with Next.js, TipTap, and Tailwind CSS.

## Features

### Spaces & Organization
- **Spaces** — isolated documentation workspaces with role-based access (admin / writer / reader)
- **Categories** — nested folder structure within each space
- **Tags** — hierarchical `#tag` system with `#parent/child` support, inline tag linking, and tag-based filtering

### Editor
- **Rich text editing** powered by TipTap (ProseMirror) with bubble menu toolbar
- **Slash commands** (`/`) — headings, lists, tables, code blocks, callouts, images, drawings, diagrams
- **Excalidraw** — embedded whiteboard drawings stored as assets
- **Draw.io** — embedded diagrams via iframe with SVG preview
- **Collapsible bullet lists** — Logseq-style collapse with bow connector lines
- **Code blocks** — syntax highlighting via lowlight with language labels and copy button
- **Callouts** — info, warning, success, danger blocks
- **Drag handle** — Notion-style block drag & drop
- **Formatting** — bold, italic, underline, strikethrough, highlight (multicolor), text color, font size, alignment, superscript/subscript, links

### Documents
- **Read / Edit mode** — toggle editing with pencil/check button
- **Autosave** — saves automatically while editing
- **Revision history** — file-based snapshots with diff/compare view and revert
- **Archive** — archive and restore documents
- **Move** — relocate documents between categories
- **Markdown storage** — all documents stored as `.md` files on disk

### Users & Auth
- **Session-based authentication** with cookie sessions
- **User self-registration** — new users register and see a pending access screen until an admin assigns them to a space
- **User profiles** — change full name, email, password, and avatar
- **Admin panel** — manage users, spaces, permissions, and SMTP settings
- **SMTP email** — configurable email notifications (e.g. admin notified on new registration)

### Theming
- **Three themes** — Light, Dark, and Dracula
- Theme switcher in the topbar

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Editor**: TipTap / ProseMirror
- **Styling**: Tailwind CSS
- **Language**: TypeScript
- **Icons**: Lucide React
- **Markdown**: marked (parse) + turndown (serialize)
- **Drawing**: Excalidraw + Draw.io
- **Email**: Nodemailer
- **Storage**: File-based (JSON config + Markdown documents on disk)

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first launch you'll be prompted to create the initial admin account.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
config/              # JSON config files (users, sessions, spaces, smtp, avatars)
docs/                # Document storage (docs/{space}/{category}/{doc}.md)
archive/             # Archived documents
history/             # Revision snapshots
src/
  app/
    api/             # API routes (auth, spaces, docs, settings, assets)
    admin/           # Admin panel
    login/           # Login page
    register/        # Registration page
    profile/         # User profile page
    setup/           # First-time setup
    page.tsx         # Main app (editor + sidebar)
  components/
    extensions/      # TipTap extensions (slash commands, callouts, excalidraw,
                     #   draw.io, collapsible lists, drag handle, tags, etc.)
    modals/          # Modal dialogs
    sidebar/         # Sidebar with categories, docs, tags
    Editor.tsx       # Main editor component
    Topbar.tsx       # Top navigation bar
  lib/
    auth.ts          # Authentication utilities
    config.ts        # File-based config read/write
    email.ts         # Nodemailer SMTP utilities
    types.ts         # TypeScript type definitions
```

## Configuration

All configuration is stored as JSON files in the `config/` directory:

- `users.json` — user accounts
- `sessions.json` — active sessions
- `spaces.json` — spaces and permissions
- `smtp.json` — SMTP email settings (configurable in Admin → Settings)

Avatars are stored in `config/avatars/`.

## License

Private project.
