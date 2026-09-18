---
name: create-data-table
description: Use when creating, modifying, refactoring, or fixing data tables — including columns, row actions, filters, sorting, pagination, layout, responsiveness, scrolling, computed columns, stats widgets above tables, or making a table consistent with other tables. Also triggers for "make X table like other tables", table style/UX consistency requests, table-centric admin/list pages that "look different" or should "match the rest of the app", and adding detail panels. Ensures consistent table patterns using DataTableWrapper.
---

# Create/Modify Data Table

## Checklist

- [ ] Using `DataTableWrapper` from `@/components/data-table/data-table-wrapper`
- [ ] Storage key follows `{entity}_table_state_v1` convention
- [ ] All columns have `meta: { headerTitle, skeleton }`
- [ ] Column headers use `DataGridColumnHeader` with `visibility={true}`
- [ ] Row actions use `DropdownMenu` with standard props
- [ ] Delete confirmations use `useConfirmAction` hook
- [ ] Currency formatted with `formatINR` from `@/lib/form-schemas`
- [ ] New tables use ReUI Filters via `filter={{ fields, getValue }}`; server-paginated tables set `applyLocally: false`
- [ ] Opt into `compactOnMobile` for directory tables; mark identity columns `meta.compact: "primary"`
- [ ] Detail sheets use `Sheet` from `@/components/shared/responsive-sheet`

## Column Definition Pattern

```tsx
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";

const columns = useMemo<DataGridColumnDef<MyEntity>[]>(() => [
  {
    id: "name",
    accessorFn: (row) => row.name,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Name" visibility={true} />
    ),
    cell: ({ row }) => <span>{row.original.name}</span>,
    meta: { compact: "primary", headerTitle: "Name", skeleton: <Skeleton className="h-5 w-40" /> },
    size: 200,
  },
  // ... more columns
  {
    id: "actions",
    cell: ({ row }) => <RowActions row={row.original} />,
    meta: {
      enableColumnOrdering: false,
      headerTitle: "",
      skeleton: <Skeleton className="size-7" />,
    },
    size: 48,
  },
], []);
```

## Row Actions Pattern

```tsx
function RowActions({ row }: { row: MyEntity }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Row actions"
          className="size-7"
          data-testid="row-actions"
          size="icon"
          variant="ghost"
        >
          <HugeiconsIcon icon={MoreVerticalIcon} className="size-4" strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32">
        {/* menu items */}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

## Delete Confirmation Pattern

```tsx
const deleteAction = useConfirmAction<string>({
  onConfirm: (id) => zero.mutate(mutators.entity.delete({ id })).server,
  mutationMeta: {
    mutation: "entity.delete",
    entityId: (id) => id,
    successMsg: "Deleted",
    errorMsg: "Failed to delete",
  },
});

// In JSX:
<ConfirmDialog
  description="This action cannot be undone."
  isLoading={deleteAction.isLoading}
  onConfirm={deleteAction.confirm}
  onOpenChange={(open) => { if (!open) deleteAction.cancel(); }}
  open={deleteAction.isOpen}
  title="Delete item?"
/>
```

## DataTableWrapper Props

```tsx
<DataTableWrapper
  columns={columns}
  compactOnMobile
  data={data}
  emptyMessage="No items found."
  isLoading={isLoading}
  searchFn={searchFn}
  storageKey="entity_table_state_v1"
  tableLayout={{
    columnsResizable: true,
    columnsDraggable: true,
    columnsVisibility: true,
    columnsPinnable: true,
  }}
  toolbarActions={<Button>...</Button>}
  filter={{
    fields: entityFilterFields,
    getValue: getEntityFilterValue,
  }}
/>
```

## Search Function Pattern

Define at module level, outside the component:

```tsx
function searchFn(row: MyEntity, query: string): boolean {
  const q = query.toLowerCase();
  return [row.name, row.email].join(" ").toLowerCase().includes(q);
}
```

## ReUI Filters

Pass unfiltered `data`. Define a module-level `getValue(row, path)` and a `FilterField[]` schema next to the table. Date fields use `dateField()` from `@/components/data-table/filter-fields`. Do not pre-filter in the route. ReUI is the only table filter; do not add combobox filters.

Client-paginated:

```tsx
filter={{
  fields: createEntityFilterFields(data),
  getValue: getEntityFilterValue,
}}
```

Server-paginated (jobs, audit log): persist chips but do not slice the current page. Map `is` rules with `readSelectEquality`. `applyLocally: false` hides Convert to advanced — those APIs only honor the first complete `is` equality:

```tsx
filter={{
  applyLocally: false,
  fields: createEntityFilterFields(options),
}}
```

## Compact on mobile

Pass `compactOnMobile` so `DataTableWrapper` collapses secondary columns below 768px of table width. Tables only set column roles:

- `meta.compact: "primary"` — stays in the compact row. Extra primaries stack under the first; mark the next scan field (status, center, role) as primary too.
- `meta.compact: "trailing"` — labeled icons or badges aligned to the right of the identity (breakfast/lunch).
- `meta.compact: "collapsed"` — default for remaining data columns; shown in the expanded panel when the row is not clickable.
- `meta.compact: "always"` — default for `select` and `actions`.
- `meta.compact: "hidden"` — omit from the compact row and the panel.

Do not add a manual expand column. The wrapper injects it only when the table has no `onRowClick` (row click already opens a detail sheet or page). Compact mode also disables column reordering.

## Pinning

Default pinning in `DataTableWrapper` is `{ start: ["select"], end: ["actions"] }`. Use `start`/`end`, never `left`/`right`. Opt a column out of drag-reorder with `meta.enableColumnOrdering: false`, not a root column-def flag.

## Anti-Patterns

- **Never** use `useReactTable` directly — use `DataTableWrapper` (it calls `useDataGridTable`)
- **Never** type columns as `ColumnDef<T>` — use `DataGridColumnDef<T>`
- **Never** use manual `useState` for delete confirmation — use `useConfirmAction`
- **Never** use inline `Intl.NumberFormat` — use `formatINR`
- **Never** omit `data-testid="row-actions"` on action menu triggers
- **Never** import detail `Sheet` from the design-system sheet — use `@/components/shared/responsive-sheet`
- **Never** use bare `visibility` — always write `visibility={true}`
