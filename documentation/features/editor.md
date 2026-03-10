# Editor

doc-it uses **TipTap** (a ProseMirror-based rich text editor) with a Markdown storage back-end. You write in a rich WYSIWYG environment; the content is saved and exchanged as Markdown.


---

## Switching Between View and Edit

Documents open in **read mode** by default. Click the **Edit** button (pencil icon) in the top-right document bar to enter edit mode.

While editing, the toolbar shows:
- **Autosave on** — changes are saved automatically as you type.
- **Done** — finishes editing and creates a revision snapshot.
- **Discard** — restores the document to the state it was in when you clicked Edit.


---

## Slash Commands

While editing, type `/` anywhere in the document to open the slash-command menu. Available commands include:

| Command | Description |
|---|---|
| `/heading1`, `/heading2`, `/heading3` | Insert headings |
| `/bullet` | Bullet list |
| `/ordered` | Numbered list |
| `/task` | Task / checkbox list |
| `/blockquote` | Blockquote |
| `/code` | Inline code |
| `/codeblock` | Fenced code block with language |
| `/table` | Insert a table |
| `/image` | Embed an image by URL |
| `/link` | Insert a hyperlink |
| `/divider` | Horizontal rule |
| `/drawing` | Embed an Excalidraw drawing |
| `/diagram` | Embed a Draw.io diagram |
| `/database` | Embed a database block |
| `/attachment` | Upload a file attachment |
| `/linkpreview` | Rich link preview card |

---

## Formatting Toolbar

When text is selected, a floating toolbar appears with common formatting actions: **Bold**, **Italic**, **Underline**, **Strikethrough**, **Code**, **Link**, and **Highlight**.

---

## Page Width

The document bar contains a **Narrow / Wide / Max** width toggle that controls how much horizontal space the editor uses. Your preference is saved to your profile.

---

## Reading View

Click the **Book** icon in the document bar (when not editing) to open a full-screen distraction-free reading overlay. Press **Esc** or click **Exit** to return.


---

## Table of Contents

Click the **TOC** tab on the far right edge of the editor area to open a Table of Contents panel, generated automatically from the headings in the document.


---

## Drawings (Excalidraw)

Use the `/drawing` slash command to embed an Excalidraw whiteboard inside a document. Click the drawing to open the Excalidraw editor in a modal. The SVG is stored in the document's Markdown as a data URI.

---

## Diagrams (Draw.io)

Use the `/diagram` slash command to embed a Draw.io (diagrams.net) XML diagram. Click the diagram to open the editor in a modal. The XML is stored inline.

---

## Link Preview

Use `/linkpreview` to paste a URL and generate a rich card preview (title, description, favicon) fetched server-side.

---

## Attachments

Use `/attachment` to upload a file. The file is stored in `docs/{space}/{category}/attachments/` and a download link is embedded in the document.

---

## Embedded Database Blocks

Use `/database` to embed a full database view (table, kanban, calendar, or gallery) inline inside a document. Clicking a relation chip in a cell navigates to the referenced database.

---

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + B` | Bold |
| `Ctrl/Cmd + I` | Italic |
| `Ctrl/Cmd + U` | Underline |
| `Ctrl/Cmd + K` | Insert link |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `Esc` | Exit distraction-free / reading view |
| `/` | Open slash command menu |
