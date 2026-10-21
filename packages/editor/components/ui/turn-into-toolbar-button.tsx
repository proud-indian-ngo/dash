"use client";

import * as React from "react";

import type { TElement } from "platejs";

import {
  ArrowRight01Icon,
  CheckmarkSquare01Icon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  ParagraphIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KEYS } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

import { setBlockType } from "../editor/transforms";
import { ToolbarButton, ToolbarMenuGroup } from "./toolbar";

const turnIntoItems = [
  {
    icon: <HugeiconsIcon icon={ParagraphIcon} />,
    label: "Text",
    value: KEYS.p,
  },
  {
    icon: <HugeiconsIcon icon={Heading01Icon} />,
    label: "Heading 1",
    value: "h1",
  },
  {
    icon: <HugeiconsIcon icon={Heading02Icon} />,
    label: "Heading 2",
    value: "h2",
  },
  {
    icon: <HugeiconsIcon icon={Heading03Icon} />,
    label: "Heading 3",
    value: "h3",
  },
  {
    icon: <HugeiconsIcon icon={LeftToRightListBulletIcon} />,
    label: "Bulleted list",
    value: KEYS.ulClassic,
  },
  {
    icon: <HugeiconsIcon icon={LeftToRightListNumberIcon} />,
    label: "Numbered list",
    value: KEYS.olClassic,
  },
  {
    icon: <HugeiconsIcon icon={CheckmarkSquare01Icon} />,
    label: "To-do list",
    value: KEYS.taskList,
  },
  {
    icon: <HugeiconsIcon icon={ArrowRight01Icon} />,
    label: "Toggle list",
    value: KEYS.toggle,
  },
  {
    icon: <HugeiconsIcon icon={SourceCodeIcon} />,
    label: "Code",
    value: KEYS.codeBlock,
  },
  {
    icon: <HugeiconsIcon icon={LeftToRightBlockQuoteIcon} />,
    label: "Quote",
    value: KEYS.blockquote,
  },
];

export function TurnIntoToolbarButton() {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => (node as TElement).type,
  });
  // Only what this editor's plugins can hold.
  const items = turnIntoItems.filter((item) => item.value in editor.plugins);
  const selectedItem =
    items.find((item) => item.value === (value ?? KEYS.p)) ?? items[0]!;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            className="min-w-[125px]"
            pressed={open}
            tooltip="Turn into"
            isDropdown
          >
            {selectedItem.label}
          </ToolbarButton>
        }
      />

      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-0"
        align="start"
      >
        <ToolbarMenuGroup
          value={value}
          onValueChange={(type) => {
            setBlockType(editor, type as string);
          }}
          label="Turn into"
        >
          {items.map(({ icon, label, value: itemValue }) => (
            <DropdownMenuRadioItem key={itemValue} value={itemValue}>
              {icon}
              {label}
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
