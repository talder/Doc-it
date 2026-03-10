---
title: "Doc-it — Complete Test Checklist"
author: "QA Manual Testing"
date: "2026-03-09"
geometry: "margin=1.8cm"
fontsize: 10pt
header-includes:
  - \usepackage{enumitem}
  - \usepackage{amssymb}
  - \usepackage{fancyhdr}
  - \pagestyle{fancy}
  - \fancyhead[L]{Doc-it Test Checklist}
  - \fancyhead[R]{\thepage}
  - \fancyfoot[C]{}
  - \renewcommand{\headrulewidth}{0.4pt}
  - \setlength{\parskip}{0pt}
  - \setlength{\parindent}{0pt}
---

# 1. SETUP & FIRST RUN

- $\square$ Open `/setup` — initial admin creation page loads
- $\square$ Create admin account with username, password, email
- $\square$ Redirected to login page after setup
- $\square$ Setup page no longer accessible after admin is created

# 2. AUTHENTICATION

## Login
- $\square$ Login with valid credentials — redirected to main app
- $\square$ Login with wrong password — error shown
- $\square$ Login with non-existent user — error shown
- $\square$ Session persists after page refresh
- $\square$ Session expires after 8 hours (or idle timeout at 1 hour)
- $\square$ Logout — redirected to login page
- $\square$ Cannot access main app without login

## Registration
- $\square$ Open `/register` — registration form loads
- $\square$ Register new user
- $\square$ New user sees "Access Pending" screen (no spaces assigned)
- $\square$ Admin contacts shown on pending screen

## TOTP MFA
- $\square$ Enable TOTP from profile — QR code shown
- $\square$ Scan QR code with authenticator app
- $\square$ Verify TOTP code to complete setup
- $\square$ Backup codes are shown and downloadable
- $\square$ Login now requires TOTP code
- $\square$ Login with backup code works
- $\square$ Disable TOTP from profile
- $\square$ Admin force-enable TOTP for a user

## Password & Security
- $\square$ Change password from profile page
- $\square$ Old password rejected after change
- $\square$ Password reuse prevented (history check)
- $\square$ Account lockout after repeated failures
- $\square$ Legacy SHA-256 hash auto-migrated to bcrypt on login

# 3. USER PROFILE

- $\square$ View profile page (`/profile`)
- $\square$ Update full name
- $\square$ Update email
- $\square$ Upload avatar image
- $\square$ Avatar displays in topbar
- $\square$ Change accent colour — UI updates immediately
- $\square$ Change editor font size (Small / Normal / Large / X-Large)
- $\square$ Toggle "Always show Table of Contents" preference
- $\square$ Preferences persist across sessions / devices

# 4. ADMIN PANEL

## User Management
- $\square$ Open admin panel (`/admin`)
- $\square$ View list of all users
- $\square$ Edit user details
- $\square$ Delete a user
- $\square$ Promote user to admin
- $\square$ Revoke admin status
- $\square$ Reset user's TOTP

## Space Management
- $\square$ Create a new space
- $\square$ Edit space name/slug
- $\square$ Delete a space
- $\square$ Assign user to space with role (admin/writer/reader)
- $\square$ Change user's role in a space
- $\square$ Remove user from a space

## SMTP Settings
- $\square$ Configure SMTP server (host, port, user, password)
- $\square$ Send test email
- $\square$ Save SMTP settings

## Service API Keys
- $\square$ Create a service API key (`dk_s_...`)
- $\square$ Set per-space permissions on service key
- $\square$ Set expiry date
- $\square$ Secret shown once on creation
- $\square$ Delete a service key

## Backup & Restore
- $\square$ Configure backup settings (schedule, retention)
- $\square$ Add local backup target
- $\square$ Add CIFS/SMB backup target
- $\square$ Run manual backup
- $\square$ Backup file appears (`.tar.gz.enc`)
- $\square$ Download a backup
- $\square$ Restore from a backup
- $\square$ Retention cleanup removes old backups
- $\square$ Key rotation — rotate encryption key
- $\square$ After rotation, TOTP/backup/CIFS passwords still work

# 5. SPACES & NAVIGATION

- $\square$ Switch between spaces via topbar dropdown
- $\square$ Space home page displays on space switch
- $\square$ Only accessible spaces shown for non-admin users
- $\square$ Space home shows recent activity / overview

# 6. SIDEBAR

## Categories
- $\square$ Create a new category
- $\square$ Create a nested sub-category
- $\square$ Rename a category
- $\square$ Delete an empty category
- $\square$ Cannot delete category with documents
- $\square$ Expand / collapse category tree
- $\square$ Set category icon (emoji picker)
- $\square$ Set category colour

## Documents List
- $\square$ Documents listed under their categories
- $\square$ Click to open a document
- $\square$ Active document highlighted
- $\square$ Right-click context menu (rename, move, delete, etc.)
- $\square$ Document status indicator shown (draft/review/approved)

## Tags
- $\square$ Tags section starts collapsed
- $\square$ Expand tags section
- $\square$ Tags tree shows hierarchical `parent/child` structure
- $\square$ Click tag — filters documents
- $\square$ Tag shows document count
- $\square$ Expand tag shows associated documents
- $\square$ Click document under tag — opens it
- $\square$ "Collapse all" / "Expand all" buttons work
- $\square$ Reindex tags button works

## Favorites
- $\square$ Add a document to favorites
- $\square$ Add a database to favorites
- $\square$ Favorites section shows in sidebar
- $\square$ Click favorite — navigates to document/database
- $\square$ Remove a favorite
- $\square$ Favorites persist across sessions

## Templates
- $\square$ Templates section visible in sidebar
- $\square$ Create a new template
- $\square$ Edit an existing template
- $\square$ Export a template
- $\square$ Import a template

# 7. DOCUMENT BAR

- $\square$ Breadcrumb shows `category / docname.md`
- $\square$ Page width toggle (Narrow / Wide / Max) works
- $\square$ Revision badge shown (e.g., "Rev 3")
- $\square$ Click revision badge — opens history modal
- $\square$ Tag chips displayed for tagged documents
- $\square$ Remove tag via × button on chip
- $\square$ Add tag via + button
- $\square$ Tag autocomplete from existing tags
- $\square$ Create new tag inline
- $\square$ Document classification badge shown (Public/Internal/Confidential/Restricted)
- $\square$ Click classification — dropdown to change
- $\square$ Like/thumbs up button works
- $\square$ Like count updates
- $\square$ Reading view toggle (BookOpen icon)
- $\square$ Presence avatars shown when others are editing

# 8. EDITOR — TEXT FORMATTING

- $\square$ Enter edit mode (pencil button)
- $\square$ Type text — text appears
- $\square$ Select text — bubble menu toolbar appears
- $\square$ **Bold** (Cmd+B)
- $\square$ *Italic* (Cmd+I)
- $\square$ Underline (Cmd+U)
- $\square$ ~~Strikethrough~~
- $\square$ Highlight text (multiple colours available)
- $\square$ Text colour picker
- $\square$ Font size change
- $\square$ Superscript
- $\square$ Subscript
- $\square$ Inline code
- $\square$ Clear formatting
- $\square$ Undo (Cmd+Z)
- $\square$ Redo (Cmd+Shift+Z)

# 9. EDITOR — SLASH COMMANDS

## Headings
- $\square$ Type `/` — slash command menu appears
- $\square$ `/Heading 1` — inserts H1
- $\square$ `/Heading 2` — inserts H2
- $\square$ `/Heading 3` — inserts H3
- $\square$ `/Heading 4` — inserts H4
- $\square$ Filter slash commands by typing (e.g., `/head`)

## Lists
- $\square$ `/Bullet List` — creates bulleted list
- $\square$ `/Numbered List` — creates numbered list
- $\square$ `/Task List` — creates task list with checkboxes
- $\square$ Indent list items (Tab)
- $\square$ Outdent list items (Shift+Tab)
- $\square$ Task list — check/uncheck items

## Alignment
- $\square$ `/Align Left`
- $\square$ `/Align Center`
- $\square$ `/Align Right`

## Content Blocks
- $\square$ `/Callout` — inserts callout block (info style)
- $\square$ Change callout type (info/warning/success/danger)
- $\square$ `/Code Block` — inserts code block
- $\square$ Code block language selector
- $\square$ Code block syntax highlighting
- $\square$ Code block copy button
- $\square$ `/Collapsible` — inserts collapsible section
- $\square$ Collapse / expand collapsible section
- $\square$ `/Divider` — inserts horizontal rule
- $\square$ `/Quote` — inserts blockquote

## Table
- $\square$ `/Table` — inserts 3×3 table with header row
- $\square$ Type in table cells
- $\square$ Navigate cells with Tab
- $\square$ Header row styled differently
- $\square$ Add row below
- $\square$ Add row above
- $\square$ Delete row
- $\square$ Add column right
- $\square$ Add column left
- $\square$ Delete column
- $\square$ Delete entire table
- $\square$ Merge cells
- $\square$ Split merged cells
- $\square$ Table header toggle

## Media & Inserts
- $\square$ `/Image` — opens file picker, inserts image
- $\square$ Resize image (drag handles)
- $\square$ `/Attachment` — opens file picker, uploads file
- $\square$ Attachment download link rendered
- $\square$ `/Drawing` — opens Excalidraw editor
- $\square$ Draw in Excalidraw, save — drawing embedded
- $\square$ Edit existing drawing — reopens Excalidraw
- $\square$ `/Diagram` — inserts Draw.io iframe
- $\square$ Edit diagram in Draw.io, SVG preview renders
- $\square$ `/PDF` — uploads and embeds a PDF viewer
- $\square$ PDF pages render and are scrollable
- $\square$ `/Link` — inserts hyperlink
- $\square$ Edit link URL and text
- $\square$ `/Inline Equation` — inserts KaTeX math
- $\square$ Math equation renders correctly
- $\square$ `/Emoji` — opens emoji picker
- $\square$ Selected emoji inserted
- $\square$ `/Color Swatch` — opens colour picker
- $\square$ Colour swatch inserted with hex code
- $\square$ `/Date Now` — inserts current date & time
- $\square$ `/Date Today` — inserts today's date

## Data / Docs
- $\square$ `/New Database` — creates and inserts new database
- $\square$ `/Insert Database` — inserts existing database
- $\square$ `/Linked Document` — links to another doc in space
- $\square$ Linked doc click navigates to target
- $\square$ `/Template Field` — inserts template placeholder

## Other Editor Features
- $\square$ Drag handle — drag blocks to reorder
- $\square$ `#tag` inline — creates tag link
- $\square$ Click inline tag — navigates to tagged doc or selects tag
- $\square$ `@mention` — mentions a user
- $\square$ Emoji shortcodes (`:smile:`) convert to emoji

# 10. EDITOR — AUTOSAVE & MODES

- $\square$ Autosave triggers while editing (status shows "Saving..." then "Autosave on")
- $\square$ Exit edit mode — changes persisted
- $\square$ Edit mode — pencil icon changes to checkmark
- $\square$ View mode — markdown rendered as HTML
- $\square$ Reading view — clean reading layout
- $\square$ Distraction-free mode — all chrome hidden
- $\square$ Exit distraction-free mode with Esc

# 11. TABLE OF CONTENTS

- $\square$ TOC panel shows H1–H4 headings
- $\square$ Click TOC entry — scrolls to heading
- $\square$ TOC updates when headings change
- $\square$ Resize TOC panel
- $\square$ Close/open TOC via tab toggle on page edge
- $\square$ "Always show TOC" preference remembered

# 12. DOCUMENT OPERATIONS

## Revision History
- $\square$ Open history modal (click rev badge or menu)
- $\square$ List of revisions shown with timestamps
- $\square$ View a specific revision
- $\square$ Diff/compare view between revisions
- $\square$ Restore a previous revision
- $\square$ Revision number increments after edit

## Archive
- $\square$ Archive a document (right-click or menu)
- $\square$ Document disappears from sidebar
- $\square$ Open archive modal — archived doc listed
- $\square$ Restore archived document — reappears in sidebar

## Trash
- $\square$ Delete a document — moved to trash
- $\square$ Open trash modal — deleted doc listed
- $\square$ Restore from trash
- $\square$ Permanently delete from trash

## Move
- $\square$ Move document to another category
- $\square$ Document appears in new category
- $\square$ Removed from old category

## Rename
- $\square$ Rename document via context menu
- $\square$ New name reflected in sidebar and breadcrumb

## Share
- $\square$ Share document — generates share link
- $\square$ Set share mode (read / read-write)
- $\square$ Set share password
- $\square$ Set share expiry
- $\square$ Copy share link
- $\square$ Open share link in incognito — doc accessible
- $\square$ Expired share link blocked

# 13. DOCUMENT STATUS & REVIEW

- $\square$ Set document status (Draft / In Review / Approved / Published)
- $\square$ Submit document for review
- $\square$ Reviewer receives notification
- $\square$ Reviewer can approve or request changes
- $\square$ Status badge updates in sidebar

# 14. DATABASES

- $\square$ Create a new database from sidebar
- $\square$ Database opens in main content area
- $\square$ Add columns with types: text, number, date, checkbox, select, multi-select, URL
- $\square$ Add rows
- $\square$ Edit cell values
- $\square$ Delete a row
- $\square$ Delete a column
- $\square$ Rename a column
- $\square$ Switch to Table view
- $\square$ Switch to Board (Kanban) view
- $\square$ Switch to Gallery view
- $\square$ Filter rows by column value
- $\square$ Sort by any column (asc/desc)
- $\square$ Search within database
- $\square$ Rename database
- $\square$ Delete database
- $\square$ Add database to favorites
- $\square$ Embedded database in document renders correctly

# 15. GLOBAL SEARCH (Cmd+K)

- $\square$ `Cmd+K` opens search modal
- $\square$ Type query — instant results (name + tag matches)
- $\square$ Server-side content search with snippets
- $\square$ Changelog results shown
- $\square$ Asset results shown
- $\square$ Helpdesk ticket results shown
- $\square$ Click result — navigates to document/item
- $\square$ Recent searches remembered
- $\square$ Clear recent searches
- $\square$ Filter: by category
- $\square$ Filter: by tag
- $\square$ Filter: by author
- $\square$ Filter: by classification
- $\square$ Filter: by date range (from / to)
- $\square$ Keyboard navigation (arrows + Enter)
- $\square$ Escape closes modal
- $\square$ Topbar search field triggers search modal

# 16. JOURNAL

## Personal Journal
- $\square$ Open journal page (`/journal`)
- $\square$ Create new journal entry
- $\square$ Set entry date
- $\square$ Set entry title
- $\square$ Write entry content (markdown)
- $\square$ Add tags to entry
- $\square$ Set mood emoji
- $\square$ Save entry
- $\square$ Edit existing entry
- $\square$ Delete entry
- $\square$ Pin / unpin entry
- $\square$ Calendar view — days with entries highlighted
- $\square$ Click calendar day — shows entries for that day
- $\square$ Filter by tag
- $\square$ Filter by date range
- $\square$ Search entries by text
- $\square$ Show only pinned entries
- $\square$ Entries are encrypted at rest (verify via DB)
- $\square$ Export journal as JSON

## Space Journal
- $\square$ Switch to space journal
- $\square$ Create space journal entry
- $\square$ Space journal entries visible to space members

## Journal Templates
- $\square$ Create journal template
- $\square$ Use template when creating entry
- $\square$ Delete template

# 17. CHANGE LOG

- $\square$ Open changelog page (`/changelog`)
- $\square$ Create new changelog entry
- $\square$ Auto-assigned ID (CHG-0001, etc.)
- $\square$ Set date
- $\square$ Set system name (with autocomplete from previous entries)
- $\square$ Set category (Disk/Network/Security/Software/Hardware/Configuration/Other)
- $\square$ Set risk level (Low/Medium/High/Critical)
- $\square$ Set status (Completed/Failed/Rolled Back)
- $\square$ Write description
- $\square$ Write impact assessment
- $\square$ Link to a documentation page (optional)
- $\square$ View entry details
- $\square$ Filter by date range
- $\square$ Filter by category
- $\square$ Filter by system name
- $\square$ Search by free text
- $\square$ Risk level colour coding visible

# 18. ASSET MANAGEMENT

- $\square$ Open assets page (`/assets`)
- $\square$ Create a container group (e.g., "Rack A")
- $\square$ Create nested sub-group
- $\square$ Rename a container
- $\square$ Delete empty container
- $\square$ Create new asset
- $\square$ Auto-assigned ID (AST-0001, etc.)
- $\square$ Set asset name, type, status
- $\square$ Set IP addresses
- $\square$ Set OS, location, owner
- $\square$ Set purchase date, warranty expiry
- $\square$ Add notes
- $\square$ Fill custom fields
- $\square$ Edit existing asset
- $\square$ Delete an asset
- $\square$ View asset detail modal
- $\square$ Filter by container (click tree node)
- $\square$ "All Assets" view shows everything
- $\square$ Search across all asset fields
- $\square$ Sort by column (name/type/status/location/owner)
- $\square$ Custom field definitions — add new field
- $\square$ Custom field definitions — edit field
- $\square$ Custom field definitions — delete field
- $\square$ CSV import — upload CSV file
- $\square$ CSV import — map columns
- $\square$ CSV import — assets appear after import

# 19. HELPDESK & TICKETING

## Agent UI
- $\square$ Open helpdesk page (`/helpdesk`)
- $\square$ Create new ticket
- $\square$ Set subject, description, priority, category
- $\square$ Assign to group
- $\square$ Assign to person
- $\square$ Link to asset (optional)
- $\square$ Fill custom fields
- $\square$ View ticket detail panel
- $\square$ Add comment (public)
- $\square$ Add internal note
- $\square$ Upload attachment to comment
- $\square$ Download ticket attachment
- $\square$ Change ticket status
- $\square$ Change ticket priority
- $\square$ Close a ticket
- $\square$ Reopen a ticket
- $\square$ SLA timer display (response due / resolution due)
- $\square$ Filter tickets by status
- $\square$ Filter tickets by priority
- $\square$ Filter tickets by assigned group
- $\square$ Search tickets

## Admin Configuration (`/helpdesk/admin`)
- $\square$ Create support group
- $\square$ Add members to group
- $\square$ Edit group
- $\square$ Delete group
- $\square$ Create ticket category
- $\square$ Edit category (name, description, icon, order)
- $\square$ Delete category
- $\square$ Create custom field definition
- $\square$ Edit custom field (name, type, required, options)
- $\square$ Delete custom field
- $\square$ Form Designer — create new form
- $\square$ Form Designer — add standard fields (subject, description, priority, category, asset)
- $\square$ Form Designer — add custom fields
- $\square$ Form Designer — reorder fields (drag & drop)
- $\square$ Form Designer — set field width (half/full)
- $\square$ Form Designer — set help text
- $\square$ Form Designer — set category filter on form
- $\square$ Form Designer — set default form
- $\square$ Form Designer — delete form
- $\square$ Rule Engine — create new rule
- $\square$ Rule Engine — add conditions (field, operator, value)
- $\square$ Rule Engine — set match type (all/any)
- $\square$ Rule Engine — add actions (assign group, set priority, etc.)
- $\square$ Rule Engine — enable/disable rule
- $\square$ Rule Engine — set stop-on-match
- $\square$ Rule Engine — reorder rules
- $\square$ Rule Engine — delete rule
- $\square$ Rule Engine — verify rule fires on ticket creation
- $\square$ SLA Editor — create SLA policy
- $\square$ SLA Editor — set response/resolution times per priority
- $\square$ SLA Editor — set business hours
- $\square$ SLA Editor — set default SLA
- $\square$ SLA Editor — delete SLA policy

# 20. PORTAL & PUBLIC PAGES

## Portal User Flow
- $\square$ Open portal login page (`/portal/login`)
- $\square$ Register portal user (`/portal/register`)
- $\square$ Login as portal user
- $\square$ Portal home page loads with widgets
- $\square$ Submit ticket from portal
- $\square$ View "My Tickets" from portal
- $\square$ Add comment on own ticket
- $\square$ Logout from portal

## Portal Page Designer (Admin)
- $\square$ Open portal page designer in helpdesk admin
- $\square$ Create new portal page
- $\square$ Set page name and slug
- $\square$ Set page as home page
- $\square$ Add Hero widget — configure title, subtitle, colour
- $\square$ Add Ticket Form widget
- $\square$ Add My Tickets widget
- $\square$ Add Announcements widget — configure content
- $\square$ Add FAQ widget — configure Q&A pairs
- $\square$ Add Categories widget
- $\square$ Add Search widget
- $\square$ Add Custom HTML widget — enter HTML
- $\square$ Add Quick Links widget — configure links
- $\square$ Reorder widgets (drag & drop)
- $\square$ Set widget width (full / half / third)
- $\square$ Remove widget from page
- $\square$ Preview page
- $\square$ Publish page (Globe icon)
- $\square$ Unpublish page (GlobeLock icon)

## Public Portal Listing
- $\square$ Open `/portals` — published pages listed
- $\square$ Click portal card — opens `/portals/[slug]`
- $\square$ Unpublished pages not shown in listing
- $\square$ Widgets render correctly on public page

# 21. AUDIT LOGGING

- $\square$ Open admin audit tab
- $\square$ Calendar heatmap shows event volume
- $\square$ Click day — shows events for that day
- $\square$ Event explorer lists events
- $\square$ Filter by event type
- $\square$ Filter by actor
- $\square$ Filter by date range
- $\square$ Event details expandable
- $\square$ Export as CSV
- $\square$ Export as JSON
- $\square$ Verify integrity (HMAC chain check)
- $\square$ Configure retention days
- $\square$ Configure syslog target
- $\square$ Test syslog connection
- $\square$ Audit events logged for: login, logout, doc create, doc edit, user create, space create, settings change (spot-check)

# 22. THEMING & PERSONALISATION

- $\square$ Switch to each theme and verify UI renders:
- $\square$ — Light
- $\square$ — Solarized Light
- $\square$ — Dracula Light
- $\square$ — Catppuccin Latte
- $\square$ — Paper
- $\square$ — High Contrast
- $\square$ — Blossom
- $\square$ — Lavender
- $\square$ — Dark
- $\square$ — Dracula
- $\square$ — Nord
- $\square$ — Solarized Dark
- $\square$ — GitHub Dark
- $\square$ — Catppuccin Mocha
- $\square$ — Twilight
- $\square$ — Midnight Rose
- $\square$ — High Contrast Dark
- $\square$ Switch accent colour (Blue/Indigo/Violet/Rose/Orange/Green/Teal)
- $\square$ Accent colour reflected in buttons, links, badges
- $\square$ Theme preference saved to profile

# 23. API KEYS

- $\square$ Create personal API key (`dk_u_...`) from profile
- $\square$ Secret shown once — copy it
- $\square$ Set expiry date
- $\square$ Use key as Bearer token in API request — works
- $\square$ Expired key rejected
- $\square$ Delete personal API key
- $\square$ Service key (`dk_s_...`) with space-level permissions — test API access

# 24. NOTIFICATIONS & PRESENCE

- $\square$ Presence avatars shown when multiple users edit same doc
- $\square$ Presence warning when another user is editing
- $\square$ Watch a document for availability
- $\square$ Notification appears when watched doc becomes available
- $\square$ Browser notification (if permitted)
- $\square$ Dismiss notification
- $\square$ Clear all notifications
- $\square$ Click notification — navigates to document

# 25. TOPBAR

- $\square$ Space switcher dropdown works
- $\square$ Home button returns to space home
- $\square$ Search field opens search modal
- $\square$ Archive button opens archive modal
- $\square$ Trash button opens trash modal
- $\square$ Review badge shows pending review count
- $\square$ Click review badge — navigates to document under review
- $\square$ Notification bell shows notification count
- $\square$ User menu — profile, admin, logout links
- $\square$ All tooltips display on icon hover

# 26. RESPONSIVE & EDGE CASES

- $\square$ App loads without JavaScript errors (check console)
- $\square$ No broken images or missing icons
- $\square$ Empty states: no docs, no spaces, no tickets — all show friendly messages
- $\square$ Long document names truncated properly
- $\square$ Large documents (500+ lines) load without lag
- $\square$ Concurrent editing by two users — no data loss
- $\square$ Browser back/forward navigation works
- $\square$ Page refresh preserves state (selected doc, space)

\vspace{1cm}
\begin{center}
\textbf{Tester:} \rule{6cm}{0.4pt} \hspace{1cm} \textbf{Date:} \rule{4cm}{0.4pt}
\end{center}
