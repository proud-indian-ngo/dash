import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { handleMutationResult } from "@/lib/mutation-result";

const localVolunteerNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export function KalakritiLocalVolunteerForm({
  editionId,
  onCancel,
  onCreated,
  printedCardId,
  submitLabel,
}: {
  editionId: string;
  onCancel: () => void;
  onCreated: () => void;
  printedCardId?: string;
  submitLabel: string;
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: { name: "" },
    validators: {
      onChange: localVolunteerNameSchema,
      onSubmit: localVolunteerNameSchema,
    },
    onSubmit: async ({ value }) => {
      const membershipId = printedCardId ?? uuidv7();
      const result = await zero.mutate(
        mutators.kalakritiAssignment.createLocalVolunteer({
          auditEntryId: uuidv7(),
          editionId,
          membershipId,
          name: value.name.trim(),
          now: Date.now(),
          requirePrintedCardId: printedCardId !== undefined,
        })
      ).server;
      handleMutationResult(result, {
        entityId: membershipId,
        errorMsg: "Failed to create volunteer",
        mutation: "kalakritiAssignment.createLocalVolunteer",
        successMsg: printedCardId
          ? "Volunteer card registered"
          : "Volunteer created",
      });
      if (result.type !== "error") {
        onCreated();
      }
    },
  });

  return (
    <FormLayout form={form}>
      <InputField isRequired label="Name" name="name" />
      <FormActions
        onCancel={onCancel}
        submitLabel={submitLabel}
        submittingLabel={
          printedCardId ? "Registering volunteer..." : "Creating volunteer..."
        }
      />
    </FormLayout>
  );
}
