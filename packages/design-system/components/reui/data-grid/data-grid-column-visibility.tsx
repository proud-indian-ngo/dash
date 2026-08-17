import type { ReactElement } from "react"
import type { DataGridTableInstance } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@pi-dash/design-system/components/ui/dropdown-menu"

function DataGridColumnVisibility<TData extends object>({
  table,
  trigger,
}: {
  table: DataGridTableInstance<TData>
  trigger: ReactElement<Record<string, unknown>>
}) {
  return (
    <table.Subscribe source={table.atoms.columnVisibility}>
      {() => (
        <DropdownMenu>
          <DropdownMenuTrigger render={trigger} />
          <DropdownMenuContent align="end" className="min-w-[150px]">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-medium">
                Toggle Columns
              </DropdownMenuLabel>
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onSelect={(event) => event.preventDefault()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.columnDef.meta?.headerTitle || column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </table.Subscribe>
  )
}

export { DataGridColumnVisibility }
