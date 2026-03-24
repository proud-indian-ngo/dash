---
name: create-dialog
description: Use when creating or modifying dialogs, modals, or alert dialogs. Ensures consistent dialog patterns including accessibility.
---

# Create/Modify Dialog

## Checklist

- [ ] `DialogTitle` present
- [ ] `DialogDescription` present (use `className="sr-only"` if no visible description)
- [ ] Form dialogs use `formKey` remount pattern for reset
- [ ] Confirmation dialogs use `useConfirmAction` hook + `ConfirmDialog`
- [ ] Loading states use `Loader` component from `@/components/loader`
- [ ] Dialog size is `sm:max-w-md` for standard forms

## Form Dialog Template

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useState } from "react";

export function MyFormDialog({ open, onOpenChange }: Props) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) setFormKey((k) => k + 1);
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Title</DialogTitle>
          <DialogDescription className="sr-only">
            Description for screen readers
          </DialogDescription>
        </DialogHeader>
        <FormContent key={formKey} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
```

## Confirmation Dialog Pattern

```tsx
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";

const action = useConfirmAction({
  onConfirm: () => zero.mutate(mutators.entity.delete({ id })).server,
  mutationMeta: {
    mutation: "entity.delete",
    entityId: id,
    successMsg: "Deleted",
    errorMsg: "Failed to delete",
  },
});

<ConfirmDialog
  description="This cannot be undone."
  isLoading={action.isLoading}
  onConfirm={action.confirm}
  onOpenChange={(open) => { if (!open) action.cancel(); }}
  open={action.isOpen}
  title="Are you sure?"
/>
```

## Anti-Patterns

- **Never** omit `DialogDescription` — accessibility violation, triggers Radix console warning
- **Never** use `form.reset()` + `useEffect` for dialog reset — use `formKey` remount
- **Never** use plain "Loading..." text — use `Loader` component
