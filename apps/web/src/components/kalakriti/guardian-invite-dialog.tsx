import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { inviteKalakritiGuardian } from "@/functions/kalakriti-guardian";

const guardianInviteFormSchema = z.object({
  email: z.email("Enter a valid email address"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  password: z
    .string()
    .refine(
      (value) => value.length === 0 || value.length >= 10,
      "Password must be at least 10 characters"
    ),
  phone: z.string(),
});

export type GuardianInviteValues = z.infer<typeof guardianInviteFormSchema>;

interface GuardianInviteDialogProps {
  editionId: string;
  onOpenChange: (open: boolean) => void;
  onRequiresConfirmation: (
    values: GuardianInviteValues,
    existingName: string
  ) => void;
  open: boolean;
}

function GuardianInviteForm({
  editionId,
  onOpenChange,
  onRequiresConfirmation,
}: Omit<GuardianInviteDialogProps, "open">) {
  const form = useForm({
    defaultValues: { email: "", name: "", password: "", phone: "" },
    onSubmit: async ({ value }) => {
      try {
        const result = await inviteKalakritiGuardian({
          data: {
            confirmReuse: false,
            editionId,
            email: value.email,
            name: value.name,
            password: value.password || undefined,
            phone: value.phone || undefined,
          },
        });
        if (result.status === "requires_confirmation") {
          onOpenChange(false);
          onRequiresConfirmation(value, result.existingName);
          return;
        }
        toast.success(
          result.status === "created"
            ? "Guardian invited"
            : "Existing account assigned as Guardian"
        );
        onOpenChange(false);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Guardian could not be invited";
        log.error({
          action: "inviteGuardian",
          component: "GuardianInviteForm",
          editionId,
          error: message,
        });
        toast.error(message);
      }
    },
    validators: {
      onChange: guardianInviteFormSchema,
      onSubmit: guardianInviteFormSchema,
    },
  });
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form} showSubmitError>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Name" name="name" />
        <InputField isRequired label="Email" name="email" type="email" />
      </div>
      <PhoneField defaultCountry="IN" label="Phone" name="phone" />
      <InputField
        autoComplete="new-password"
        description="Required only for a new account. Existing accounts keep their current password."
        label="Initial password"
        name="password"
        type="password"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel="Invite Guardian"
        submittingLabel="Inviting..."
      />
    </FormLayout>
  );
}

export function GuardianInviteDialog({
  editionId,
  onOpenChange,
  onRequiresConfirmation,
  open,
}: GuardianInviteDialogProps) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((current) => current + 1);
    }
    onOpenChange(nextOpen);
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Guardian</DialogTitle>
          <DialogDescription>
            Create yearly Guardian access or reuse an exact verified email. The
            account stays outside the central volunteer directory.
          </DialogDescription>
        </DialogHeader>
        <GuardianInviteForm
          editionId={editionId}
          key={formKey}
          onOpenChange={onOpenChange}
          onRequiresConfirmation={onRequiresConfirmation}
        />
      </DialogContent>
    </Dialog>
  );
}
