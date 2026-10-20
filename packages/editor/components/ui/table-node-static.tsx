import { cn } from "@pi-dash/design-system/lib/utils";
import {
  BaseTablePlugin,
  getTableOverriddenColSizes,
} from "@platejs/table";
import type { TTableCellElement, TTableElement } from "platejs";
import type { SlateElementProps } from "platejs/static";
import { SlateElement } from "platejs/static";
import type * as React from "react";

const TABLE_DEFAULT_COLUMN_WIDTH = 120;

export function TableElementStatic({
  children,
  ...props
}: SlateElementProps<TTableElement>) {
  const { disableMarginLeft } = props.editor.getOptions(BaseTablePlugin);
  const marginLeft = disableMarginLeft ? 0 : props.element.marginLeft;
  const colSizes = getTableOverriddenColSizes(props.element).map(
    (colSize) => colSize || TABLE_DEFAULT_COLUMN_WIDTH
  );

  return (
    <SlateElement
      {...props}
      className="overflow-x-auto py-5"
      style={{ paddingLeft: marginLeft }}
    >
      <div className="group/table relative w-fit">
        <table
          className="mr-0 ml-px table h-px table-fixed border-collapse"
          style={{
            width: colSizes.reduce((total, colSize) => total + colSize, 0),
          }}
        >
          {colSizes.length > 0 && (
            <colgroup>
              {colSizes.map((colSize, index) => (
                <col
                  key={index}
                  style={{
                    maxWidth: colSize,
                    minWidth: colSize,
                    width: colSize,
                  }}
                />
              ))}
            </colgroup>
          )}
          <tbody className="min-w-full">{children}</tbody>
        </table>
      </div>
    </SlateElement>
  );
}

export function TableRowElementStatic(props: SlateElementProps) {
  return (
    <SlateElement {...props} as="tr">
      {props.children}
    </SlateElement>
  );
}

export function TableCellElementStatic({
  isHeader,
  ...props
}: SlateElementProps<TTableCellElement> & {
  isHeader?: boolean;
}) {
  const { editor, element } = props;
  const { api } = editor.getPlugin(BaseTablePlugin);

  const { minHeight, width } = api.table.getCellSize({ element });
  const borders = api.table.getCellBorders({ element });
  const colSpan = api.table.getColSpan(element);
  const cellWidth = width || TABLE_DEFAULT_COLUMN_WIDTH * colSpan;

  return (
    <SlateElement
      {...props}
      as={isHeader ? "th" : "td"}
      attributes={{
        ...props.attributes,
        colSpan,
        rowSpan: api.table.getRowSpan(element),
      }}
      className={cn(
        "relative h-full overflow-visible border-none bg-background p-0",
        element.background ? "bg-(--cellBackground)" : "bg-background",
        isHeader && "text-left *:m-0",
        "before:size-full",
        "before:absolute before:box-border before:select-none before:content-['']",
        borders &&
          cn(
            borders.bottom?.size && "before:border-b before:border-b-border",
            borders.right?.size && "before:border-r before:border-r-border",
            borders.left?.size && "before:border-l before:border-l-border",
            borders.top?.size && "before:border-t before:border-t-border"
          )
      )}
      style={
        {
          "--cellBackground": element.background,
          maxWidth: cellWidth,
          minWidth: cellWidth,
        } as React.CSSProperties
      }
    >
      <div
        className="relative z-20 box-border h-full px-3 py-2"
        style={{ minHeight }}
      >
        {props.children}
      </div>
    </SlateElement>
  );
}

export function TableCellHeaderElementStatic(
  props: SlateElementProps<TTableCellElement>
) {
  return <TableCellElementStatic {...props} isHeader />;
}
