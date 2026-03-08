import { Extension, InputRule } from "@tiptap/core";
// @ts-ignore — no bundled types for the data package
import emojiData from "@emoji-mart/data";

const data = emojiData as {
  emojis: Record<string, { skins: { native: string }[] }>;
  aliases: Record<string, string>;
};

// Build shortcode → native char lookup once at module load
const shortcodeMap: Record<string, string> = {};

for (const [id, emoji] of Object.entries(data.emojis)) {
  const native = emoji.skins?.[0]?.native;
  if (native) shortcodeMap[id] = native;
}

// Include aliases (e.g. "thumbsup" → "+1" → "👍")
for (const [alias, canonicalId] of Object.entries(data.aliases)) {
  const native = data.emojis[canonicalId]?.skins?.[0]?.native;
  if (native) shortcodeMap[alias] = native;
}

// Matches :shortcode: at the end of the current text
const SHORTCODE_REGEX = /:([\w+-]+):$/;

export const EmojiShortcodeExtension = Extension.create({
  name: "emojiShortcode",

  addInputRules() {
    return [
      new InputRule({
        find: SHORTCODE_REGEX,
        handler({ state, range, match }) {
          const shortcode = match[1];
          const emoji = shortcodeMap[shortcode];
          if (!emoji) return; // unknown shortcode — leave text as-is
          state.tr.insertText(emoji, range.from, range.to);
        },
      }),
    ];
  },
});
