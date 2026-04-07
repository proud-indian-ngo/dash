"use client";

import { SlashInputElement } from "@pi-dash/editor/components/ui/slash-node";
import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react";
import { KEYS, type SlateEditor } from "platejs";

export const SlashKit = [
  SlashPlugin.configure({
    options: {
      triggerQuery: (editor: SlateEditor) =>
        !editor.api.some({
          match: { type: editor.getType(KEYS.codeBlock) },
        }),
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
];
