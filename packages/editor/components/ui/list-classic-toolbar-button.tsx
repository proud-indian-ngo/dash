"use client";

import { indentListItems, unindentListItems } from "@platejs/list-classic";
import {
  useListToolbarButton,
  useListToolbarButtonState,
} from "@platejs/list-classic/react";
import {
  CheckListIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  ListIndentDecreaseIcon,
  ListIndentIncreaseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KEYS } from "platejs";
import { useEditorRef } from "platejs/react";
import type * as React from "react";

import { ToolbarButton } from "./toolbar";

const nodeTypeMap: Record<string, { icon: React.JSX.Element; label: string }> =
  {
    [KEYS.olClassic]: { icon: <HugeiconsIcon icon={LeftToRightListNumberIcon} />, label: "Numbered List" },
    [KEYS.taskList]: { icon: <HugeiconsIcon icon={CheckListIcon} />, label: "Task List" },
    [KEYS.ulClassic]: { icon: <HugeiconsIcon icon={LeftToRightListBulletIcon} />, label: "Bulleted List" },
  };

export function ListToolbarButton({
  nodeType = KEYS.ulClassic,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType?: string;
}) {
  const state = useListToolbarButtonState({ nodeType });
  const { props: buttonProps } = useListToolbarButton(state);
  const { icon, label } = (nodeTypeMap[nodeType] ??
    nodeTypeMap[KEYS.ulClassic])!;

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip={label}>
      {icon}
    </ToolbarButton>
  );
}

export function IndentToolbarButton({
  reverse = false,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  reverse?: boolean;
}) {
  const editor = useEditorRef();

  return (
    <ToolbarButton
      {...props}
      onClick={() => {
        if (reverse) {
          unindentListItems(editor);
        } else {
          indentListItems(editor);
        }
      }}
      tooltip={reverse ? "Outdent" : "Indent"}
    >
      {reverse ? <HugeiconsIcon icon={ListIndentDecreaseIcon} /> : <HugeiconsIcon icon={ListIndentIncreaseIcon} />}
    </ToolbarButton>
  );
}
