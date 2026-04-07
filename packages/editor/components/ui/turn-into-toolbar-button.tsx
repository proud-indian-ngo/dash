"use client";

import * as React from "react";

import type { TElement } from "platejs";

import {
  ChevronRightIcon,
  FileCodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ListIcon,
  ListOrderedIcon,
  PilcrowIcon,
  QuoteIcon,
  SquareIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@pi-dash/components/ui/dropdown-menu";

import { getBlockType, setBlockType } from "../editor/transforms";
import { ToolbarButton, ToolbarMenuGroup } from "./toolbar";

const turnIntoItems = [
  {
    icon: <PilcrowIcon />,
    label: "Text",
    value: KEYS.p,
  },
  {
    icon: <Heading1Icon />,
    label: "Heading 1",
    value: "h1",
  },
  {
    icon: <Heading2Icon />,
    label: "Heading 2",
    value: "h2",
  },
  {
    icon: <Heading3Icon />,
    label: "Heading 3",
    value: "h3",
  },
  {
    icon: <ListIcon />,
    label: "Bulleted list",
    value: KEYS.ul,
  },
  {
    icon: <ListOrderedIcon />,
    label: "Numbered list",
    value: KEYS.ol,
  },
  {
    icon: <SquareIcon />,
    label: "To-do list",
    value: KEYS.listTodo,
  },
  {
    icon: <ChevronRightIcon />,
    label: "Toggle list",
    value: KEYS.toggle,
  },
  {
    icon: <FileCodeIcon />,
    label: "Code",
    value: KEYS.codeBlock,
  },
  {
    icon: <QuoteIcon />,
    label: "Quote",
    value: KEYS.blockquote,
  },
];

export function TurnIntoToolbarButton() {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });
  const selectedItem = React.useMemo(
    () =>
      turnIntoItems.find((item) => item.value === (value ?? KEYS.p)) ??
      turnIntoItems[0]!,
    [value]
  );

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
          {turnIntoItems.map(({ icon, label, value: itemValue }) => (
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
