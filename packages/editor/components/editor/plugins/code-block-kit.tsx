"use client";

import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from "@pi-dash/editor/components/ui/code-block-node";
import {
  CodeBlockPlugin,
  CodeLinePlugin,
  CodeSyntaxPlugin,
} from "@platejs/code-block/react";
import { all, createLowlight } from "lowlight";

const lowlight = createLowlight(all);

export const CodeBlockKit = [
  CodeBlockPlugin.configure({
    node: { component: CodeBlockElement },
    options: { lowlight },
    shortcuts: { toggle: { keys: "mod+alt+8" } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
