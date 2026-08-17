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
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { handleMutationResult } from "@/lib/mutation-result";

const participationRulesSchema = z.object({
  minTotalCompetitions: z.number().int().min(1),
});

function ParticipationRulesForm({
  editionId,
  minTotalCompetitions,
  onOpenChange,
}: {
  editionId: string;
  minTotalCompetitions: number;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: { minTotalCompetitions },
    onSubmit: async ({ value }) => {
      const result = await zero.mutate(
        mutators.kalakritiEdition.updateParticipationRules({
          auditEntryId: uuidv7(),
          editionId,
          minTotalCompetitions: value.minTotalCompetitions,
          now: Date.now(),
        })
      ).server;
      handleMutationResult(result, {
        entityId: editionId,
        errorMsg: "Couldn't update minimum Competitions",
        mutation: "kalakritiEdition.updateParticipationRules",
        successMsg: "Minimum Competitions updated",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: participationRulesSchema,
      onSubmit: participationRulesSchema,
    },
  });

  return (
    <FormLayout form={form} showSubmitError>
      <InputField
        autoFocus
        description="Participating Students must enter at least this many Competitions before Center participation registration can close. Students with no Entries are unchanged."
        isRequired
        label="Minimum Competitions"
        name="minTotalCompetitions"
        type="number"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel="Save minimum"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function EditionParticipationRulesDialog({
  editionId,
  minTotalCompetitions,
  variant = "button",
}: {
  editionId: string;
  minTotalCompetitions: number;
  variant?: "button" | "inline";
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
      {variant === "inline" ? (
        <Button
          className="h-auto p-0 tabular-nums"
          onClick={handleTrigger}
          type="button"
          variant="link"
        >
          Min {minTotalCompetitions}
        </Button>
      ) : (
        <Button
          onClick={handleTrigger}
          size="sm"
          type="button"
          variant="outline"
        >
          Edit minimum
        </Button>
      )}
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit minimum Competitions</DialogTitle>
            <DialogDescription>
              This Edition-wide floor applies when closing Center participation
              registration. It cannot exceed any Age Category total limit.
            </DialogDescription>
          </DialogHeader>
          <ParticipationRulesForm
            editionId={editionId}
            key={formKey}
            minTotalCompetitions={minTotalCompetitions}
            onOpenChange={handleOpenChange}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
