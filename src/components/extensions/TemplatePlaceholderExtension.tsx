"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { toSafeB64, fromSafeB64 } from "@/lib/base64";
import type { TplField } from "@/lib/types";

const TYPE_PREFIX: Record<string, string> = {
  text:        "T",
  textarea:    "¶",
  number:      "#",
  url:         "↗",
  email:       "@",
  dropdown:    "▾",
  radio:       "◉",
  multiselect: "☑",
  date:        "D",
  time:        "⏱",
  boolean:     "✓",
  ip:          "IP",
  mac:         "MAC",
  markdown:    "Md",
  phone:       "☎",
  color:       "Clr",
  currency:    "¤",
  rating:      "★",
  version:     "v",
  duration:    "Dur",
  iban:        "IBAN",
  vat_be:      "VAT",
  address:     "⌂",
  users:       "Usr",
  qr:          "QR",
  signature:   "✍",
};

function TemplatePlaceholderView({
  node, selected, editor, getPos,
}: {
  node: any; selected: boolean; editor: any; getPos: () => number | undefined;
}) {
  const b64 = node.attrs.fieldB64 as string;
  let field: TplField | null = null;
  try { field = fromSafeB64(b64) as TplField; } catch {}

  const prefix = field ? (TYPE_PREFIX[field.type] ?? "T") : "T";
  const name   = field?.name ?? "field";
  const req    = field?.required;

  const handleClick = (e: React.MouseEvent) => {
    if (!editor?.isEditable) return;
    e.stopPropagation();
    const pos = getPos();
    if (pos === undefined) return;
    document.dispatchEvent(
      new CustomEvent("tpl:edit-field", {
        detail: { field, pos, editor },
        bubbles: true,
      })
    );
  };

  return (
    <NodeViewWrapper
      as="span"
      className={`template-chip template-chip-${field?.type ?? "text"}${selected ? " template-chip-selected" : ""}`}
      contentEditable={false}
      onClick={handleClick}
      style={{ cursor: editor?.isEditable ? "pointer" : "default" }}
      title={editor?.isEditable ? "Click to edit field" : undefined}
    >
      <span className="template-chip-type">{prefix}</span>
      <span className="template-chip-name">{name}{req ? " *" : ""}</span>
    </NodeViewWrapper>
  );
}

export const TemplatePlaceholderExtension = Node.create({
  name: "templatePlaceholder",
  group: "inline",
  inline: true,
  atom: true,

  addAttributes() {
    return {
      fieldB64: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-tpl-field") ?? "",
        renderHTML: (a) => ({ "data-tpl-field": a.fieldB64 }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-tpl-field]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const b64 = HTMLAttributes["data-tpl-field"] ?? "";
    let name = "field";
    try { name = (fromSafeB64(b64) as TplField).name; } catch {}
    return ["span", mergeAttributes({ "data-tpl-field": b64 }), `[${name}]`];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TemplatePlaceholderView);
  },

  addCommands() {
    return {
      insertTemplatePlaceholder:
        (field: TplField) =>
        ({ commands }: { commands: any }) =>
          commands.insertContent({
            type: "templatePlaceholder",
            attrs: { fieldB64: toSafeB64(field) },
          }),
    } as any;
  },
});

/** Encode a TplField for storage in a data-tpl-field attribute. */
export { toSafeB64 as encodeTplField };

/** Decode a TplField from a data-tpl-field attribute value. */
export { fromSafeB64 as decodeTplField };
