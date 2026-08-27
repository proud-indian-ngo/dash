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
import type { GuardianRosterItem } from "@/components/kalakriti/guardians-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { updateKalakritiGuardian } from "@/functions/kalakriti-guardian";

const guardianEditFormSchema = z.object({
  email: z.email("Enter a valid email address"),
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  phone: z.string(),
});

function GuardianEditForm({
  guardian,
  onOpenChange,
}: {
  guardian: GuardianRosterItem;
  onOpenChange: (open: boolean) => void;
}) {
  const emailLocked = !guardian.isExternal;
  const form = useForm({
    defaultValues: {
      email: guardian.snapshotEmail ?? "",
      name: guardian.snapshotName,
      phone: guardian.snapshotPhone ?? "",
    },
    onSubmit: async ({ value }) => {
      try {
        await updateKalakritiGuardian({
          data: {
            email: value.email,
            membershipId: guardian.id,
            name: value.name,
            phone: value.phone || undefined,
          },
        });
        toast.success("Guardian details updated");
        onOpenChange(false);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Guardian details could not be updated";
        log.error({
          action: "updateGuardian",
          component: "GuardianEditForm",
          error: message,
          membershipId: guardian.id,
        });
        toast.error(message);
      }
    },
    validators: {
      onChange: guardianEditFormSchema,
      onSubmit: guardianEditFormSchema,
    },
  });
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form} showSubmitError>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Name" name="name" />
        <InputField
          description={
            emailLocked
              ? "Login email stays the volunteer account and cannot be changed here."
              : undefined
          }
          disabled={emailLocked}
          isRequired
          label="Email"
          name="email"
          type="email"
        />
      </div>
      <PhoneField defaultCountry="IN" label="Phone" name="phone" />
      <FormActions
        onCancel={handleCancel}
        submitLabel="Save details"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function GuardianEditDialog({
  guardian,
  onOpenChange,
  open,
}: {
  guardian: GuardianRosterItem | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
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
          <DialogTitle>Edit Guardian details</DialogTitle>
          <DialogDescription>
            Update yearly contact details for this Guardian. Dedicated accounts
            also change the login email.
          </DialogDescription>
        </DialogHeader>
        {guardian ? (
          <GuardianEditForm
            guardian={guardian}
            key={formKey}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
