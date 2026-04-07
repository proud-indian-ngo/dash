"use client";

import { insertBlock } from "@pi-dash/editor/components/editor/transforms";
import {
  ArrowRight01Icon,
  CheckmarkSquare01Icon,
  Heading01Icon,
  Heading02Icon,
  Heading03Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  MinusSignIcon,
  ParagraphIcon,
  SourceCodeIcon,
  LayoutTableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { KEYS, type TComboboxInputElement } from "platejs";
import type { PlateEditor, PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";
import type * as React from "react";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
};

const groups: Group[] = [
  {
    group: "Basic blocks",
    items: [
      {
        icon: <HugeiconsIcon icon={ParagraphIcon} />,
        keywords: ["paragraph"],
        label: "Text",
        value: KEYS.p,
      },
      {
        icon: <HugeiconsIcon icon={Heading01Icon} />,
        keywords: ["title", "h1"],
        label: "Heading 1",
        value: KEYS.h1,
      },
      {
        icon: <HugeiconsIcon icon={Heading02Icon} />,
        keywords: ["subtitle", "h2"],
        label: "Heading 2",
        value: KEYS.h2,
      },
      {
        icon: <HugeiconsIcon icon={Heading03Icon} />,
        keywords: ["subtitle", "h3"],
        label: "Heading 3",
        value: KEYS.h3,
      },
      {
        icon: <HugeiconsIcon icon={LeftToRightListBulletIcon} />,
        keywords: ["unordered", "ul", "-"],
        label: "Bulleted list",
        value: KEYS.ulClassic,
      },
      {
        icon: <HugeiconsIcon icon={LeftToRightListNumberIcon} />,
        keywords: ["ordered", "ol", "1"],
        label: "Numbered list",
        value: KEYS.olClassic,
      },
      {
        icon: <HugeiconsIcon icon={CheckmarkSquare01Icon} />,
        keywords: ["checklist", "task", "checkbox", "[]"],
        label: "To-do list",
        value: KEYS.taskList,
      },
      {
        icon: <HugeiconsIcon icon={ArrowRight01Icon} />,
        keywords: ["collapsible", "expandable"],
        label: "Toggle",
        value: KEYS.toggle,
      },
      {
        icon: <HugeiconsIcon icon={SourceCodeIcon} />,
        keywords: ["```"],
        label: "Code Block",
        value: KEYS.codeBlock,
      },
      {
        icon: <HugeiconsIcon icon={LayoutTableIcon} />,
        label: "Table",
        value: KEYS.table,
      },
      {
        icon: <HugeiconsIcon icon={LeftToRightBlockQuoteIcon} />,
        keywords: ["citation", "blockquote", "quote", ">"],
        label: "Blockquote",
        value: KEYS.blockquote,
      },
      {
        icon: <HugeiconsIcon icon={MinusSignIcon} />,
        keywords: ["hr", "rule", "---"],
        label: "Divider",
        value: KEYS.hr,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value, { upsert: true });
      },
    })),
  },
];

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>
) {
  const { editor, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(
                ({ focusEditor, icon, keywords, label, value, onSelect }) => (
                  <InlineComboboxItem
                    focusEditor={focusEditor}
                    group={group}
                    key={value}
                    keywords={keywords}
                    label={label}
                    onClick={() => onSelect(editor, value)}
                    value={value}
                  >
                    <div className="mr-2 text-muted-foreground">{icon}</div>
                    {label ?? value}
                  </InlineComboboxItem>
                )
              )}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
