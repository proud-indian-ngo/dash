import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { authClient } from "@/lib/auth-client";

const passwordSchema = z
  .object({
    confirmPassword: z.string(),
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters"),
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
    } satisfies PasswordFormValues,
    onSubmit: async ({ value }) => {
      const { error } = await authClient.changePassword({
        currentPassword: value.currentPassword,
        newPassword: value.newPassword,
        revokeOtherSessions: false,
      });
      if (error) {
        toast.error(error.message ?? "Failed to change password");
      } else {
        toast.success("Password changed");
        form.reset();
      }
    },
    validators: {
      onBlur: passwordSchema,
      onSubmit: passwordSchema,
    },
  });

  return (
    <div className="flex flex-col gap-6 p-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="account-email">Email</Label>
        <div className="flex items-center gap-2">
          <Input
            className="opacity-60"
            disabled
            id="account-email"
            value={user?.email ?? ""}
          />
          {user?.emailVerified ? (
            <Badge variant="secondary">Verified</Badge>
          ) : (
            <Badge variant="destructive">Unverified</Badge>
          )}
        </div>
      </div>

      <Separator />

      <FormLayout className="flex flex-col gap-4" form={form}>
        <p className="font-medium text-xs">Change password</p>
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
        <div className="flex justify-end">
          <FormActions
            submitLabel="Update password"
            submittingLabel="Saving..."
          />
        </div>
      </FormLayout>
    </div>
  );
}
