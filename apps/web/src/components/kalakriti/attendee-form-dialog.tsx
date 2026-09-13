import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { uuidv7 } from "uuidv7";
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
import { handleMutationResult } from "@/lib/mutation-result";

import type { AttendeeRow } from "./attendees-table";

export const attendeeFormSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Enter a valid phone number with country code"),
  email: z
    .string()
    .trim()
    .pipe(z.union([z.literal(""), z.email("Enter a valid email address")])),
});

export function AttendeeFormDialog({
  attendee,
  editionId,
  kind,
  onClose,
}: {
  attendee?: AttendeeRow;
  editionId: string;
  kind: "guest" | "judge";
  onClose: () => void;
}) {
  const zero = useZero();
  const label = kind === "guest" ? "Guest" : "Judge";
  const form = useForm({
    defaultValues: {
      name: attendee?.name ?? "",
      phone: attendee?.phone ?? "",
      email: attendee?.email ?? "",
    },
    validators: { onChange: attendeeFormSchema, onSubmit: attendeeFormSchema },
    onSubmit: async ({ value }) => {
      const id = attendee?.id ?? uuidv7();
      const args = {
        ...value,
        name: value.name.trim(),
        phone: value.phone.trim(),
        email: value.email.trim() || null,
        id,
        editionId,
        now: Date.now(),
        auditEntryId: uuidv7(),
      };
      const result = await zero.mutate(
        attendee
          ? mutators.kalakritiAttendee.update(args)
          : mutators.kalakritiAttendee.create({ ...args, kind })
      ).server;
      handleMutationResult(result, {
        mutation: `kalakritiAttendee.${attendee ? "update" : "create"}`,
        entityId: id,
        successMsg: `${label} saved`,
        errorMsg: `${label} could not be saved`,
      });
      if (result.type !== "error") onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        aria-label={`${attendee ? "Edit" : "Add"} ${label}`}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>
            {attendee ? "Edit" : "Add"} {label}
          </DialogTitle>
          <DialogDescription>
            Yearly roster contact details only. This does not create a login
            account.
          </DialogDescription>
        </DialogHeader>
        <FormLayout form={form} showSubmitError>
          <InputField isRequired label="Name" name="name" />
          <PhoneField
            isRequired
            defaultCountry="IN"
            label="Phone"
            name="phone"
          />
          <InputField label="Email" name="email" type="email" />
          <FormActions
            onCancel={onClose}
            submitLabel={attendee ? "Save details" : `Create ${label}`}
            submittingLabel="Saving..."
          />
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
