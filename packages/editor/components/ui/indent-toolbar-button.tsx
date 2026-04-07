"use client";

import { useIndentButton, useOutdentButton } from "@platejs/indent/react";
import { ListIndentDecreaseIcon, ListIndentIncreaseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";

import { ToolbarButton } from "./toolbar";

export function IndentToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const { props: buttonProps } = useIndentButton();

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Indent">
      <HugeiconsIcon icon={ListIndentIncreaseIcon} />
    </ToolbarButton>
  );
}

export function OutdentToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const { props: buttonProps } = useOutdentButton();

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Outdent">
      <HugeiconsIcon icon={ListIndentDecreaseIcon} />
    </ToolbarButton>
  );
}
