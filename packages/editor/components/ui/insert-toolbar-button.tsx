"use client";

import * as React from "react";

import {
  ArrowRight01Icon,
  CheckmarkSquare01Icon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  Image01Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  MinusSignIcon,
  ParagraphIcon,
  PlusSignIcon,
  SourceCodeIcon,
  LayoutTableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KEYS } from "platejs";
import { type PlateEditor, useEditorRef } from "platejs/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@pi-dash/components/ui/dropdown-menu";

import { insertBlock, insertInlineElement } from "../editor/transforms";
import { ToolbarButton, ToolbarMenuGroup } from "./toolbar";

type Group = {
  group: string;
  items: Item[];
};

type Item = {
  icon: React.ReactNode;
  value: string;
  onSelect: (editor: PlateEditor, value: string) => void;
  label?: string;
};

const groups: Group[] = [
  {
    group: "Basic blocks",
    items: [
      {
        icon: <HugeiconsIcon icon={ParagraphIcon} />,
        label: "Paragraph",
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
        icon: <HugeiconsIcon icon={LayoutTableIcon} />,
        label: "Table",
        value: KEYS.table,
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
      {
        icon: <HugeiconsIcon icon={MinusSignIcon} />,
        label: "Divider",
        value: KEYS.hr,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor: PlateEditor, value: string) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: "Lists",
    items: [
      {
        icon: <HugeiconsIcon icon={LeftToRightListBulletIcon} />,
        label: "Bulleted list",
        value: KEYS.ul,
      },
      {
        icon: <HugeiconsIcon icon={LeftToRightListNumberIcon} />,
        label: "Numbered list",
        value: KEYS.ol,
      },
      {
        icon: <HugeiconsIcon icon={CheckmarkSquare01Icon} />,
        label: "To-do list",
        value: KEYS.listTodo,
      },
      {
        icon: <HugeiconsIcon icon={ArrowRight01Icon} />,
        label: "Toggle list",
        value: KEYS.toggle,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor: PlateEditor, value: string) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: "Media",
    items: [
      {
        icon: <HugeiconsIcon icon={Image01Icon} />,
        label: "Image",
        value: KEYS.img,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor: PlateEditor, value: string) => {
        insertBlock(editor, value);
      },
    })),
  },
  {
    group: "Inline",
    items: [
      {
        icon: <HugeiconsIcon icon={Link01Icon} />,
        label: "Link",
        value: KEYS.link,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor: PlateEditor, value: string) => {
        insertInlineElement(editor, value);
      },
    })),
  },
];

export function InsertToolbarButton() {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton pressed={open} tooltip="Insert" isDropdown>
            <HugeiconsIcon icon={PlusSignIcon} />
          </ToolbarButton>
        }
      />

      <DropdownMenuContent
        className="flex max-h-[500px] min-w-[180px] flex-col overflow-y-auto"
        align="start"
      >
        {groups.map(({ group, items: nestedItems }) => (
          <ToolbarMenuGroup key={group} label={group}>
            {nestedItems.map(({ icon, label, value, onSelect }) => (
              <DropdownMenuItem
                key={value}
                className="min-w-[180px]"
                onSelect={() => {
                  onSelect(editor, value);
                  editor.tf.focus();
                }}
              >
                {icon}
                {label}
              </DropdownMenuItem>
            ))}
          </ToolbarMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
