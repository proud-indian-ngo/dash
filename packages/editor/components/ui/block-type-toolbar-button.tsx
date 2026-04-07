"use client";

import { KEYS } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";
import type React from "react";

import { getBlockType, setBlockType } from "../editor/transforms";
import { ToolbarButton } from "./toolbar";

function BlockTypeToolbarButton({
  nodeType,
  children,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & { nodeType: string }) {
  const editor = useEditorRef();
  const isActive = useEditorSelector(
    (e) => {
      const block = e.api.block();
      return block ? getBlockType(block[0]) === nodeType : false;
    },
    [nodeType]
  );

  return (
    <ToolbarButton
      pressed={isActive}
      onClick={() => {
        setBlockType(editor, isActive ? KEYS.p : nodeType);
        editor.tf.focus();
      }}
      {...props}
    >
      {children}
    </ToolbarButton>
  );
}

export function H1ToolbarButton(
  props: Omit<React.ComponentProps<typeof ToolbarButton>, "nodeType">
) {
  return (
    <BlockTypeToolbarButton nodeType={KEYS.h1} tooltip="Heading 1" {...props}>
      <span className="text-xs font-bold">H1</span>
    </BlockTypeToolbarButton>
  );
}

export function H2ToolbarButton(
  props: Omit<React.ComponentProps<typeof ToolbarButton>, "nodeType">
) {
  return (
    <BlockTypeToolbarButton nodeType={KEYS.h2} tooltip="Heading 2" {...props}>
      <span className="text-xs font-bold">H2</span>
    </BlockTypeToolbarButton>
  );
}

export function H3ToolbarButton(
  props: Omit<React.ComponentProps<typeof ToolbarButton>, "nodeType">
) {
  return (
    <BlockTypeToolbarButton nodeType={KEYS.h3} tooltip="Heading 3" {...props}>
      <span className="text-xs font-bold">H3</span>
    </BlockTypeToolbarButton>
  );
}

export function BlockquoteToolbarButton(
  props: Omit<React.ComponentProps<typeof ToolbarButton>, "nodeType">
) {
  return (
    <BlockTypeToolbarButton
      nodeType={KEYS.blockquote}
      tooltip="Blockquote"
      {...props}
    >
      <span className="text-base font-bold leading-none">"</span>
    </BlockTypeToolbarButton>
  );
}

export function CodeBlockToolbarButton(
  props: Omit<React.ComponentProps<typeof ToolbarButton>, "nodeType">
) {
  return (
    <BlockTypeToolbarButton
      nodeType={KEYS.codeBlock}
      tooltip="Code block"
      {...props}
    >
      <span className="font-mono text-xs">{"{}"}</span>
    </BlockTypeToolbarButton>
  );
}
