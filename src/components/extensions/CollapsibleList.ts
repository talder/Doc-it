import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { EditorView } from "@tiptap/pm/view";

/**
 * CollapsibleList extension
 *
 * Adds click-to-collapse on bullet/ordered list items.
 * Clicking the bullet marker toggles `data-collapsed` on the <li>,
 * and CSS hides nested <ul>/<ol> when collapsed.
 * Collapse state is ephemeral (not persisted to markdown).
 */
export const CollapsibleList = Extension.create({
  name: "collapsibleList",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("collapsibleList"),
        props: {
          handleDOMEvents: {
            click(view: EditorView, event: MouseEvent) {
              const target = event.target as HTMLElement;
              if (!target) return false;

              // Only trigger on clicks in the left margin area of list items
              // (the bullet/number marker zone). We detect this by checking if the
              // click is on the <li> itself (not its text content) and is in the
              // left padding zone, OR on the ::marker pseudo area.
              const li = target.closest("li");
              if (!li) return false;

              // Don't collapse task list items
              if (li.getAttribute("data-type") === "taskItem") return false;

              // Check if the <li> has nested lists (only collapsible if it has children)
              const nestedList = li.querySelector(":scope > ul, :scope > ol");
              if (!nestedList) return false;

              // Calculate if click was in the bullet/marker area (left padding zone)
              const liRect = li.getBoundingClientRect();
              const clickX = event.clientX;

              // The marker zone is roughly the first ~24px from the left edge of the <li>
              // (before the text content starts)
              const markerZoneWidth = 28;
              if (clickX > liRect.left + markerZoneWidth) return false;

              // Toggle collapse
              const isCollapsed = li.getAttribute("data-collapsed") === "true";
              li.setAttribute("data-collapsed", isCollapsed ? "false" : "true");

              event.preventDefault();
              event.stopPropagation();
              return true;
            },
          },
        },
      }),
    ];
  },
});
