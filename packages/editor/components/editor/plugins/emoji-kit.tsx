"use client";

import emojiMartData from "@emoji-mart/data";
import { EmojiInputElement } from "@pi-dash/editor/components/ui/emoji-node";
import { EmojiInputPlugin, EmojiPlugin } from "@platejs/emoji/react";

export const EmojiKit = [
  EmojiPlugin.configure({
    options: { data: emojiMartData as any },
  }),
  EmojiInputPlugin.withComponent(EmojiInputElement),
];
