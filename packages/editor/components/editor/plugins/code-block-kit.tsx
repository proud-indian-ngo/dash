"use client";

import {
  CodeBlockElement,
  CodeLineElement,
  CodeSyntaxLeaf,
} from "../../ui/code-block-node";
import { CodeBlockRules } from "@platejs/code-block";
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
    inputRules: [CodeBlockRules.markdown({ on: "match" })],
    options: { lowlight },
    shortcuts: { toggle: { keys: "mod+alt+8" } },
  }),
  CodeLinePlugin.withComponent(CodeLineElement),
  CodeSyntaxPlugin.withComponent(CodeSyntaxLeaf),
];
