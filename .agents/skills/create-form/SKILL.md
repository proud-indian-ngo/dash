---
name: create-form
description: Use when creating, modifying, or fixing any form — including validation schemas, field interactions, default values, phone/date/select fields, error states, auth forms (login/signup), or form layout. Also triggers for dialog with form inputs, settings sections with fields, "improve validation", "fix field behavior", building a form into a provided layout, or auditing forms for consistency. Ensures consistent form patterns (useForm, Zod, FormLayout, FormActions) across the codebase.
---

# Create/Modify Form

## Checklist

Before writing form code, verify each item:

- [ ] Using `useForm` from `@tanstack/react-form` (never raw `useState` for fields)
- [ ] Zod schema defined for validation
- [ ] `validators: { onChange: schema, onSubmit: schema }` at form level
- [ ] `FormLayout` wrapping the form content
- [ ] `FormActions` for submit/cancel buttons
- [ ] Using form field components (never raw `<Label>` + `<Input>`)
- [ ] Zero mutations use `await mutation.server` + `handleMutationResult()`

## Field Components

Import from `@/components/form/`:

| Component | Use for |
|-----------|---------|
| `InputField` | Text, email, password, number, `datetime-local` |
| `SelectField` | Dropdowns |
| `TextareaField` | Multi-line text |
| `CheckboxField` | Toggles/checkboxes (renders as Switch) |
| `DateField` | Date-only pickers (Popover + Calendar) |
| `PhoneField` | Phone numbers (lazy-loaded) |
| `CustomField` | Render-prop for complex inputs (UserPicker, etc.) |

For **datetime** inputs: use `<InputField type="datetime-local">` (native browser picker).
For **date-only** inputs: use `<DateField>` (custom component with Popover + Calendar).

## Dialog Form Template

```tsx
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { handleMutationResult } from "@/lib/mutation-result";

const mySchema = z.object({
  name: z.string().min(1, "Required"),
});

function MyFormContent({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
  const zero = useZero();
  const form = useForm({
    defaultValues: { name: "" },
    validators: { onChange: mySchema, onSubmit: mySchema },
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(mutators.entity.create({ ... })).server;
      handleMutationResult(res, {
        mutation: "entity.create",
        entityId: "new",
        successMsg: "Created",
        errorMsg: "Failed to create",
      });
      if (res.type !== "error") onOpenChange(false);
    },
  });

  return (
    <FormLayout form={form}>
      <InputField isRequired label="Name" name="name" />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel="Create"
        submittingLabel="Creating..."
      />
    </FormLayout>
  );
}

// Dialog wrapper with formKey remount
export function MyDialog({ open, onOpenChange }: Props) {
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
          <DialogDescription className="sr-only">Description</DialogDescription>
        </DialogHeader>
        <MyFormContent key={formKey} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
```

## Anti-Patterns

- **Never** use `useState` for form field values
- **Never** use `.then()` chains for mutation results — use `await` + `handleMutationResult()`
- **Never** show validation errors via `toast.error` — let inline form errors handle it
- **Never** use `form.reset()` + `useEffect` for dialog reset — use `formKey` remount
- **Never** use raw `<Label>` + `<Input>` — use the form field components
