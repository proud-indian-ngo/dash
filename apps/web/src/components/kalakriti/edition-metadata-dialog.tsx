import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import type { KalakritiEdition } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import {
  calendarDateFromTimestamp,
  editionCalendarStart,
  editionMetadataFormFields,
  getRegistrationCloseTimestamp,
  registrationCloseDefaults,
  registrationClosesBeforeEvent,
  registrationCloseTimeOptions,
} from "@/lib/kalakriti-edition-metadata";
import { handleMutationResult } from "@/lib/mutation-result";

const editionMetadataFormSchema = z
  .object(editionMetadataFormFields)
  .refine(registrationClosesBeforeEvent, {
    message: "Registration must close before the event date",
    path: ["registrationCloseDate"],
  });

function EditionMetadataForm({
  edition,
  onOpenChange,
}: {
  edition: KalakritiEdition;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const router = useRouter();
  const registrationClose = registrationCloseDefaults(
    edition.plannedRegistrationCloseAt
  );
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      ageCutoffDate: calendarDateFromTimestamp(edition.ageCutoffDate),
      brandingKey: edition.brandingKey,
      eventDate: calendarDateFromTimestamp(edition.eventDate),
      name: edition.name,
      registrationCloseDate: registrationClose.date,
      registrationCloseTime: registrationClose.time,
    },
    onSubmit: async ({ value }) => {
      const result = await zero.mutate(
        mutators.kalakritiEdition.updateMetadata({
          ageCutoffDate: format(value.ageCutoffDate, "yyyy-MM-dd"),
          auditEntryId: uuidv7(),
          brandingKey: value.brandingKey.trim(),
          editionId: edition.id,
          eventDate: format(value.eventDate, "yyyy-MM-dd"),
          name: value.name.trim(),
          now: Date.now(),
          plannedRegistrationCloseAt: getRegistrationCloseTimestamp(
            value.registrationCloseDate,
            value.registrationCloseTime
          ),
        })
      ).server;
      handleMutationResult(result, {
        entityId: edition.id,
        errorMsg: "Couldn't update Edition details",
        mutation: "kalakritiEdition.updateMetadata",
        successMsg: "Edition details updated",
      });
      if (result.type !== "error") {
        onOpenChange(false);
        await router.invalidate();
      }
    },
    validators: {
      onChange: editionMetadataFormSchema,
      onSubmit: editionMetadataFormSchema,
    },
  });

  return (
    <FormLayout form={form} showSubmitError>
      <InputField autoFocus isRequired label="Edition name" name="name" />
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          endMonth={new Date(2200, 11, 1)}
          isRequired
          label="Event date"
          name="eventDate"
          startMonth={editionCalendarStart}
        />
        <DateField
          endMonth={new Date(2200, 11, 1)}
          isRequired
          label="Age cutoff date"
          name="ageCutoffDate"
          startMonth={editionCalendarStart}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <DateField
          endMonth={new Date(2200, 11, 1)}
          isRequired
          label="Registration close date"
          name="registrationCloseDate"
          startMonth={editionCalendarStart}
        />
        <SelectField
          isRequired
          label="Registration close time (IST)"
          name="registrationCloseTime"
          options={registrationCloseTimeOptions}
          placeholder="Select a time"
        />
      </div>
      <InputField
        description="Used by code-defined Edition branding."
        isRequired
        label="Branding key"
        name="brandingKey"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel="Save details"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function EditionMetadataDialog({
  edition,
}: {
  edition: KalakritiEdition;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    setOpen(nextOpen);
  });
  const handleTrigger = useEventCallback(() => handleOpenChange(true));

  return (
    <>
      <Button onClick={handleTrigger} type="button" variant="outline">
        Edit Edition details
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Edition details</DialogTitle>
            <DialogDescription>
              Changes to the name and event date also update the protected
              organization event.
            </DialogDescription>
          </DialogHeader>
          <EditionMetadataForm
            edition={edition}
            key={formKey}
            onOpenChange={handleOpenChange}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
