---
name: create-data-table
description: Use when creating or modifying data tables, adding columns, row actions, filters, or pagination. Ensures consistent table patterns.
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

## Column Definition Pattern

```tsx
const columns = useMemo<ColumnDef<MyEntity>[]>(() => [
  {
    id: "name",
    accessorFn: (row) => row.name,
    header: ({ column }) => (
      <DataGridColumnHeader column={column} title="Name" visibility={true} />
    ),
    cell: ({ row }) => <span>{row.original.name}</span>,
    meta: { headerTitle: "Name", skeleton: <Skeleton className="h-5 w-40" /> },
    size: 200,
  },
  // ... more columns
  {
    id: "actions",
    cell: ({ row }) => <RowActions row={row.original} />,
    meta: { headerTitle: "", skeleton: <Skeleton className="size-7" /> },
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

## Anti-Patterns

- **Never** use `useReactTable` directly for main tables — use `DataTableWrapper`
- **Never** use manual `useState` for delete confirmation — use `useConfirmAction`
- **Never** use inline `Intl.NumberFormat` — use `formatINR`
- **Never** omit `data-testid="row-actions"` on action menu triggers
- **Never** use bare `visibility` — always write `visibility={true}`
