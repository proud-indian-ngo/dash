"use client";

import type { PlateElementProps } from "platejs/react";
import { PlateElement } from "platejs/react";

/**
 * A plain bordered table for the rich text preset: equal columns, no
 * resizing, merging, colours or borders to pick, the same in the editor and
 * the renderer. Phones scroll it sideways rather than squeeze the columns.
 */
export function SimpleTableElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="my-2 overflow-x-auto">
      <table className="w-full min-w-96 table-fixed border-collapse text-sm">
        <tbody>{props.children}</tbody>
      </table>
    </PlateElement>
  );
}

export function SimpleTableRowElement(props: PlateElementProps) {
  return <PlateElement {...props} as="tr" />;
}

export function SimpleTableCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="td"
      className="border px-2 py-1 align-top"
    />
  );
}

export function SimpleTableHeaderCellElement(props: PlateElementProps) {
  return (
    <PlateElement
      {...props}
      as="th"
      className="bg-muted border px-2 py-1 text-left align-top font-semibold"
    />
  );
}
