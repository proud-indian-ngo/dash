import type { User } from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import type { AdminSetUserPasswordInput } from "@/functions/user-admin";

interface PasswordFormProps {
  onCancel: () => void;
  onSubmit: (input: AdminSetUserPasswordInput) => Promise<void>;
  user: User;
}

const passwordFields = {
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
};

const passwordSchema = z
  .object(passwordFields)
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export function PasswordForm({ onCancel, onSubmit, user }: PasswordFormProps) {
  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      newPassword: "",
    },
    onSubmit: async ({ value }) => {
      await onSubmit({
        newPassword: value.newPassword,
        userId: user.id,
      });
      form.reset();
    },
    validators: {
      onChange: passwordSchema,
      onSubmit: passwordSchema,
    },
  });

  return (
    <FormLayout className="grid gap-3" form={form}>
      <InputField
        isRequired
        label="New password"
        name="newPassword"
        type="password"
      />

      <InputField
        isRequired
        label="Confirm new password"
        name="confirmPassword"
        type="password"
      />

      <FormActions
        className="pt-1"
        form={form}
        onCancel={onCancel}
        submitLabel="Update password"
        submittingLabel="Updating..."
      />
    </FormLayout>
  );
}
