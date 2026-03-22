import { useForm } from "@tanstack/react-form";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { authClient } from "@/lib/auth-client";

const passwordResetFields = {
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
};

const passwordResetSchema = z
  .object(passwordResetFields)
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const passwordResetFieldValidators = {
  confirmPassword: {
    onBlur: passwordResetFields.confirmPassword,
  },
  newPassword: { onBlur: passwordResetFields.newPassword },
};

export function ResetPasswordForm() {
  const navigate = useNavigate({ from: "/reset-password" });
  const { token } = useSearch({ from: "/_auth/reset-password" });

  const form = useForm({
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.resetPassword({
        newPassword: value.newPassword,
        token,
      });
      if (error) {
        toast.error(error.message || error.statusText);
        return;
      }
      navigate({ to: "/login", search: { status: "password-reset" } });
    },
    validators: {
      onSubmit: passwordResetSchema,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="font-bold text-2xl">Reset your password</h2>
        <p className="text-muted-foreground text-sm">
          Enter your new password below.
        </p>
      </div>
      <FormLayout className="space-y-4" form={form}>
        <InputField
          autoComplete="new-password"
          isRequired
          label="New password"
          name="newPassword"
          placeholder="Enter new password"
          type="password"
          validators={passwordResetFieldValidators.newPassword}
        />
        <InputField
          autoComplete="new-password"
          isRequired
          label="Confirm password"
          name="confirmPassword"
          placeholder="Confirm new password"
          type="password"
          validators={passwordResetFieldValidators.confirmPassword}
        />
        <FormActions
          className="w-full"
          form={form}
          submitClassName="w-full"
          submitLabel="Reset password"
          submittingLabel="Resetting..."
        />
      </FormLayout>
    </div>
  );
}
