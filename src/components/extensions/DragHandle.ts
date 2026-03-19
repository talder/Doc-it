"use client";

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, NodeSelection } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";
import { copyToClipboard } from "@/lib/clipboard";
import { showCopyToastDOM } from "@/components/CopyToast";

const dragHandleKey = new PluginKey("dragHandle");

// ── Helpers ──

function findBlockParent(node: Node, editorDom: HTMLElement): HTMLElement | null {
  let current = node as HTMLElement;
  while (current && current !== editorDom) {
    if (current.parentElement === editorDom && current.nodeType === 1) {
      return current;
    }
    current = current.parentElement as HTMLElement;
  }
  return null;
}

function getBlockInfo(view: EditorView, block: HTMLElement) {
  try {
    const pos = view.posAtDOM(block, 0);
    const resolved = view.state.doc.resolve(pos);
    const blockPos = resolved.before(1);
    const node = view.state.doc.nodeAt(blockPos);
    return node ? { pos: blockPos, node } : null;
  } catch {
    return null;
  }
}

function getBlockTypeName(typeName: string, attrs: Record<string, unknown>): string {
  switch (typeName) {
    case "heading": return `Heading ${attrs.level}`;
    case "paragraph": return "Paragraph";
    case "bulletList": return "Bullet List";
    case "orderedList": return "Ordered List";
    case "taskList": return "Task List";
    case "blockquote": return "Blockquote";
    case "codeBlock": return "Code Block";
    case "table": return "Table";
    case "horizontalRule": return "Divider";
    default: return typeName.charAt(0).toUpperCase() + typeName.slice(1);
  }
}

// ── SVG Icons ──

const ICON_PLUS = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

const ICON_GRIP = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="4" r="1.5"/><circle cx="15" cy="4" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>`;

const MI = {
  turnInto: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
  color: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="10.5" r="2.5"/><circle cx="8.5" cy="7.5" r="2.5"/><circle cx="6.5" cy="12.5" r="2.5"/><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12a9.98 9.98 0 0 0 4 8l2-2.5a5 5 0 0 1 4-1.5Z"/></svg>`,
  reset: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1"/><rect x="9" y="3" width="12" height="12" rx="2"/><line x1="13" y1="7" x2="17" y2="11"/><line x1="17" y1="7" x2="13" y2="11"/></svg>`,
  duplicate: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  copy: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`,
  chevron: `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`,
};

// ── Block menu builder ──

function createBlockMenu(
  view: EditorView,
  block: HTMLElement,
  cleanup: () => void,
): HTMLElement | null {
  const info = getBlockInfo(view, block);
  if (!info) return null;
  const { pos, node } = info;

  const menu = document.createElement("div");
  menu.className = "block-menu";

  // Header: block type label
  const header = document.createElement("div");
  header.className = "block-menu-header";
  header.textContent = getBlockTypeName(node.type.name, node.attrs);
  menu.appendChild(header);
  addSep(menu);

  // Turn Into (submenu)
  const turnIntoItems = [
    { label: "Paragraph", cmd: () => view.dispatch(view.state.tr.setBlockType(pos, pos + node.nodeSize, view.state.schema.nodes.paragraph)) },
    { label: "Heading 1", cmd: () => view.dispatch(view.state.tr.setBlockType(pos, pos + node.nodeSize, view.state.schema.nodes.heading, { level: 1 })) },
    { label: "Heading 2", cmd: () => view.dispatch(view.state.tr.setBlockType(pos, pos + node.nodeSize, view.state.schema.nodes.heading, { level: 2 })) },
    { label: "Heading 3", cmd: () => view.dispatch(view.state.tr.setBlockType(pos, pos + node.nodeSize, view.state.schema.nodes.heading, { level: 3 })) },
  ];
  addSubmenu(menu, MI.turnInto, "Turn Into", turnIntoItems, cleanup);

  // Color (submenu)
  const colorItems = [
    { label: "Default", swatch: "" },
    { label: "Red", swatch: "#ef4444" },
    { label: "Orange", swatch: "#f97316" },
    { label: "Green", swatch: "#22c55e" },
    { label: "Blue", swatch: "#3b82f6" },
    { label: "Purple", swatch: "#a855f7" },
  ];
  addColorSubmenu(menu, MI.color, "Color", colorItems, view, pos, node, cleanup);
  addSep(menu);

  // Reset formatting
  addItem(menu, MI.reset, "Reset formatting", () => {
    const from = pos + 1;
    const to = pos + node.nodeSize - 1;
    if (from < to) {
      const tr = view.state.tr;
      view.state.doc.nodesBetween(from, to, (_n, _p) => {});
      // Remove all marks in range
      node.marks?.forEach((mark) => { view.dispatch(view.state.tr.removeMark(from, to, mark.type)); });
      // Simpler: use stored marks removal
      let clearTr = view.state.tr;
      view.state.schema.marks && Object.values(view.state.schema.marks).forEach((markType) => {
        clearTr = clearTr.removeMark(from, to, markType as any);
      });
      view.dispatch(clearTr);
    }
    cleanup();
  });

  // Duplicate
  addItem(menu, MI.duplicate, "Duplicate", () => {
    const tr = view.state.tr;
    tr.insert(pos + node.nodeSize, node.copy(node.content));
    view.dispatch(tr);
    cleanup();
  });

  // Copy to clipboard
  addItem(menu, MI.copy, "Copy to clipboard", () => {
    copyToClipboard(node.textContent).then((ok) => {
      if (ok) showCopyToastDOM("Copied!");
    });
    cleanup();
  });

  addSep(menu);

  // Delete
  addItem(menu, MI.trash, "Delete", () => {
    view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize));
    cleanup();
  }, true);

  return menu;
}

function addSep(parent: HTMLElement) {
  const sep = document.createElement("div");
  sep.className = "block-menu-sep";
  parent.appendChild(sep);
}

function addItem(parent: HTMLElement, iconSvg: string, label: string, onClick: () => void, danger = false) {
  const btn = document.createElement("button");
  btn.className = "block-menu-item" + (danger ? " danger" : "");
  btn.innerHTML = `<span class="block-menu-icon">${iconSvg}</span><span>${label}</span>`;
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  parent.appendChild(btn);
}

function addSubmenu(
  parent: HTMLElement,
  iconSvg: string,
  label: string,
  items: { label: string; cmd: () => void }[],
  cleanup: () => void,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "block-menu-sub-wrapper";

  const trigger = document.createElement("button");
  trigger.className = "block-menu-item";
  trigger.innerHTML = `<span class="block-menu-icon">${iconSvg}</span><span>${label}</span><span class="block-menu-chevron">${MI.chevron}</span>`;
  wrapper.appendChild(trigger);

  const sub = document.createElement("div");
  sub.className = "block-menu-sub";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "block-menu-item";
    btn.innerHTML = `<span>${item.label}</span>`;
    btn.addEventListener("click", (e) => { e.stopPropagation(); item.cmd(); cleanup(); });
    sub.appendChild(btn);
  });
  wrapper.appendChild(sub);
  parent.appendChild(wrapper);
}

function addColorSubmenu(
  parent: HTMLElement,
  iconSvg: string,
  label: string,
  items: { label: string; swatch: string }[],
  view: EditorView,
  pos: number,
  node: any,
  cleanup: () => void,
) {
  const wrapper = document.createElement("div");
  wrapper.className = "block-menu-sub-wrapper";

  const trigger = document.createElement("button");
  trigger.className = "block-menu-item";
  trigger.innerHTML = `<span class="block-menu-icon">${iconSvg}</span><span>${label}</span><span class="block-menu-chevron">${MI.chevron}</span>`;
  wrapper.appendChild(trigger);

  const sub = document.createElement("div");
  sub.className = "block-menu-sub";
  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.className = "block-menu-item";
    const swatchHtml = item.swatch
      ? `<span class="block-menu-swatch" style="background:${item.swatch}"></span>`
      : `<span class="block-menu-swatch default-swatch"></span>`;
    btn.innerHTML = `${swatchHtml}<span>${item.label}</span>`;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const from = pos + 1;
      const to = pos + node.nodeSize - 1;
      if (from < to) {
        if (item.swatch) {
          // Apply color mark
          const colorMark = view.state.schema.marks.textStyle?.create({ color: item.swatch });
          if (colorMark) view.dispatch(view.state.tr.addMark(from, to, colorMark));
        } else {
          // Remove color
          const textStyle = view.state.schema.marks.textStyle;
          if (textStyle) view.dispatch(view.state.tr.removeMark(from, to, textStyle));
        }
      }
      cleanup();
    });
    sub.appendChild(btn);
  });
  wrapper.appendChild(sub);
  parent.appendChild(wrapper);
}

// ── Extension ──

export const DragHandle = Extension.create({
  name: "dragHandle",

  addProseMirrorPlugins() {
    let container: HTMLElement | null = null;
    let addBtn: HTMLElement | null = null;
    let gripBtn: HTMLElement | null = null;
    let menuEl: HTMLElement | null = null;
    let currentBlock: HTMLElement | null = null;
    let draggedNodePos: number | null = null;
    let hideTimeout: ReturnType<typeof setTimeout> | null = null;

    const showHandle = () => {
      if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
      if (container) container.style.display = "flex";
    };

    const scheduleHide = () => {
      if (hideTimeout) clearTimeout(hideTimeout);
      hideTimeout = setTimeout(() => {
        if (menuEl) return; // don't hide while menu is open
        if (container) container.style.display = "none";
        currentBlock = null;
      }, 200);
    };

    const closeMenu = () => {
      if (menuEl) { menuEl.remove(); menuEl = null; }
    };

    return [
      new Plugin({
        key: dragHandleKey,
        view(editorView) {
          // Build handle container with + and grip buttons
          container = document.createElement("div");
          container.className = "block-handle-container";
          container.style.display = "none";

          addBtn = document.createElement("button");
          addBtn.className = "block-handle-btn block-handle-add";
          addBtn.setAttribute("data-drag-handle", "true");
          addBtn.innerHTML = ICON_PLUS;
          addBtn.title = "Add block below";

          gripBtn = document.createElement("button");
          gripBtn.className = "block-handle-btn block-handle-grip";
          gripBtn.setAttribute("data-drag-handle", "true");
          gripBtn.setAttribute("draggable", "true");
          gripBtn.innerHTML = ICON_GRIP;
          gripBtn.title = "Drag to move \u00B7 Click for menu";

          container.appendChild(addBtn);
          container.appendChild(gripBtn);

          const parent = editorView.dom.parentElement;
          if (parent) {
            parent.style.position = "relative";
            parent.appendChild(container);
          }

          // ── Position ──
          const positionHandle = (block: HTMLElement) => {
            if (!container || !parent) return;
            const parentRect = parent.getBoundingClientRect();
            const blockRect = block.getBoundingClientRect();
            container.style.top = `${blockRect.top - parentRect.top}px`;
            container.style.left = "-56px";
            showHandle();
          };

          // ── Mouse tracking ──
          const onMouseMove = (e: MouseEvent) => {
            if (!container) return;
            const target = e.target as HTMLElement;
            if (target.closest("[data-drag-handle]") || target.closest(".block-menu")) {
              showHandle();
              return;
            }
            const block = findBlockParent(target, editorView.dom);
            if (block) {
              if (block !== currentBlock) {
                closeMenu();
                currentBlock = block;
                positionHandle(block);
              } else {
                showHandle();
              }
            }
          };

          const onEditorLeave = () => { scheduleHide(); };
          const onHandleEnter = () => { showHandle(); };
          const onHandleLeave = (e: MouseEvent) => {
            const related = e.relatedTarget as HTMLElement | null;
            if (related && editorView.dom.contains(related)) return;
            if (related?.closest(".block-menu")) return;
            scheduleHide();
          };

          // ── Add button: insert paragraph + trigger slash ──
          const onAddClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentBlock) return;
            const info = getBlockInfo(editorView, currentBlock);
            if (!info) return;
            const insertAt = info.pos + info.node.nodeSize;

            const paraType = editorView.state.schema.nodes.paragraph;
            const tr = editorView.state.tr.insert(insertAt, paraType.create());
            const sel = editorView.state.selection.constructor as any;
            tr.setSelection(sel.near(tr.doc.resolve(insertAt + 1)));
            editorView.dispatch(tr);
            editorView.focus();

            // Type "/" to trigger slash commands
            setTimeout(() => {
              editorView.dispatch(
                editorView.state.tr.insertText("/", editorView.state.selection.from)
              );
            }, 10);
          };

          // ── Grip click: show block menu ──
          const onGripClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (!currentBlock || !parent) return;

            if (menuEl) { closeMenu(); return; }

            menuEl = createBlockMenu(editorView, currentBlock, () => { closeMenu(); });
            if (!menuEl) return;

            const parentRect = parent.getBoundingClientRect();
            const gripRect = gripBtn!.getBoundingClientRect();
            menuEl.style.top = `${gripRect.bottom - parentRect.top + 4}px`;
            menuEl.style.left = `${gripRect.left - parentRect.left}px`;
            parent.appendChild(menuEl);
          };

          // ── Drag ──
          const onDragStart = (e: DragEvent) => {
            if (!currentBlock) return;
            closeMenu();
            const info = getBlockInfo(editorView, currentBlock);
            if (!info) return;
            draggedNodePos = info.pos;

            const tr = editorView.state.tr;
            tr.setSelection(NodeSelection.create(editorView.state.doc, info.pos));
            editorView.dispatch(tr);

            if (e.dataTransfer) {
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", info.node.textContent);
              const ghost = currentBlock.cloneNode(true) as HTMLElement;
              ghost.style.opacity = "0.7";
              ghost.style.position = "absolute";
              ghost.style.top = "-1000px";
              ghost.style.width = `${currentBlock.offsetWidth}px`;
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, 0, 0);
              setTimeout(() => ghost.remove(), 0);
            }
            currentBlock.classList.add("is-dragging");
          };

          const onDragEnd = () => {
            draggedNodePos = null;
            document.querySelectorAll(".is-dragging").forEach((el) => el.classList.remove("is-dragging"));
          };

          const onDrop = (e: DragEvent) => {
            if (draggedNodePos === null) return;
            e.preventDefault();
            const dropPos = editorView.posAtCoords({ left: e.clientX, top: e.clientY });
            if (!dropPos) return;

            const { state } = editorView;
            const node = state.doc.nodeAt(draggedNodePos);
            if (!node) return;

            let insertPos: number;
            try { insertPos = state.doc.resolve(dropPos.pos).before(1); } catch { insertPos = dropPos.pos; }

            try {
              const blockEl = editorView.domAtPos(insertPos);
              if (blockEl.node instanceof HTMLElement) {
                const rect = blockEl.node.getBoundingClientRect();
                if (e.clientY > rect.top + rect.height / 2) {
                  const bn = state.doc.nodeAt(insertPos);
                  if (bn) insertPos += bn.nodeSize;
                }
              }
            } catch { /* use as-is */ }

            let adj = insertPos;
            if (insertPos > draggedNodePos) adj -= node.nodeSize;
            const tr = state.tr;
            tr.delete(draggedNodePos, draggedNodePos + node.nodeSize);
            tr.insert(Math.max(0, adj), node.copy(node.content));
            editorView.dispatch(tr);
            draggedNodePos = null;
          };

          // ── Close menu on outside click ──
          const onDocClick = (e: MouseEvent) => {
            if (!menuEl) return;
            const target = e.target as HTMLElement;
            if (!menuEl.contains(target) && !gripBtn?.contains(target)) closeMenu();
          };

          // ── Wire up events ──
          editorView.dom.addEventListener("mousemove", onMouseMove);
          editorView.dom.addEventListener("mouseleave", onEditorLeave);
          container.addEventListener("mouseenter", onHandleEnter);
          container.addEventListener("mouseleave", onHandleLeave);
          addBtn.addEventListener("click", onAddClick);
          gripBtn.addEventListener("click", onGripClick);
          gripBtn.addEventListener("dragstart", onDragStart);
          gripBtn.addEventListener("dragend", onDragEnd);
          editorView.dom.addEventListener("drop", onDrop);
          document.addEventListener("click", onDocClick, true);

          return {
            destroy() {
              if (hideTimeout) clearTimeout(hideTimeout);
              editorView.dom.removeEventListener("mousemove", onMouseMove);
              editorView.dom.removeEventListener("mouseleave", onEditorLeave);
              editorView.dom.removeEventListener("drop", onDrop);
              document.removeEventListener("click", onDocClick, true);
              closeMenu();
              container?.remove();
            },
          };
        },
      }),
    ];
  },
});
