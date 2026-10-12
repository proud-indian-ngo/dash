import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SettingsCard, SettingsRow } from "@/components/settings/settings-ui";
import { StatusBadge } from "@/components/shared/status-badge";
import { authClient } from "@/lib/auth-client";

const passwordSchema = z
  .object({
    confirmPassword: z.string(),
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
    revokeOtherSessions: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.confirmPassword !== data.newPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Passwords do not match",
        path: ["confirmPassword"],
      });
    }
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export function AccountSection() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      currentPassword: "",
      newPassword: "",
      revokeOtherSessions: false as boolean,
    } satisfies PasswordFormValues,
    onSubmit: async ({ value }) => {
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: value.revokeOtherSessions,
      });
      if (error) {
        toast.error(error.message ?? "Failed to change password");
      } else {
        toast.success("Password changed!");
        form.reset();
      }
    },
    validators: {
      onChange: passwordSchema,
      onSubmit: passwordSchema,
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <SettingsCard>
        <SettingsRow description={user?.email ?? ""} title="Sign-in email">
          <StatusBadge tone={user?.emailVerified ? "success" : "warning"}>
            {user?.emailVerified ? "Verified" : "Unverified"}
          </StatusBadge>
        </SettingsRow>
      </SettingsCard>

      <FormLayout className="flex max-w-md flex-col gap-4" form={form}>
        <h2 className="text-sm font-medium">Change password</h2>
        <InputField
          label="Current password"
          name="currentPassword"
          type="password"
        />
        <InputField label="New password" name="newPassword" type="password" />
        <InputField
          label="Confirm new password"
          name="confirmPassword"
          type="password"
        />
        <CheckboxField
          label="Sign out all other devices"
          name="revokeOtherSessions"
        />
        <FormActions
          submitLabel="Update password"
          submittingLabel="Saving..."
        />
      </FormLayout>
    </div>
  );
}
