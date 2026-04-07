"use client";

import {
  useToggleToolbarButton,
  useToggleToolbarButtonState,
} from "@platejs/toggle/react";
import { CollapseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";

import { ToolbarButton } from "./toolbar";

export function ToggleToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const state = useToggleToolbarButtonState();
  const { props: buttonProps } = useToggleToolbarButton(state);

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Toggle">
      <HugeiconsIcon icon={CollapseIcon} />
    </ToolbarButton>
  );
}
