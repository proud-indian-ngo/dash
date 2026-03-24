import type { User } from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import type { AdminSetUserBanInput } from "@/functions/user-admin";

interface BanUserFormProps {
  onCancel: () => void;
  onSubmit: (input: AdminSetUserBanInput) => Promise<void>;
  user: User;
}

const banUserSchema = z.object({
  banExpires: z.string(),
  banReason: z.string().min(10, "Reason must be at least 10 characters"),
});

export function BanUserForm({ onCancel, onSubmit, user }: BanUserFormProps) {
  const form = useForm({
    defaultValues: {
      banExpires: "",
      banReason: "",
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        banExpires: value.banExpires || undefined,
        banReason: value.banReason,
        banned: true,
        userId: user.id,
      });
      form.reset();
    },
    validators: {
      onChange: banUserSchema,
      onSubmit: banUserSchema,
    },
  });

  return (
    <FormLayout className="grid gap-3" form={form}>
      <TextareaField isRequired label="Ban reason" name="banReason" />

      <InputField
        description="Optional. Leave empty for an indefinite ban."
        label="Ban expires"
        name="banExpires"
        type="datetime-local"
      />

      <FormActions
        className="pt-1"
        form={form}
        onCancel={onCancel}
        submitLabel="Ban user"
        submittingLabel="Banning..."
        submitVariant="destructive"
      />
    </FormLayout>
  );
}
