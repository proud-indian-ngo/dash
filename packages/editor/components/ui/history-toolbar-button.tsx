"use client";

import { ArrowTurnBackwardIcon, ArrowTurnForwardIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEditorRef, useEditorSelector } from "platejs/react";

import { ToolbarButton } from "./toolbar";

export function UndoToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (editor) => editor.history.undos.length === 0,
    []
  );

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.undo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Undo"
    >
      <HugeiconsIcon icon={ArrowTurnBackwardIcon} />
    </ToolbarButton>
  );
}

export function RedoToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();
  const disabled = useEditorSelector(
    (editor) => editor.history.redos.length === 0,
    []
  );

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.redo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Redo"
    >
      <HugeiconsIcon icon={ArrowTurnForwardIcon} />
    </ToolbarButton>
  );
}
