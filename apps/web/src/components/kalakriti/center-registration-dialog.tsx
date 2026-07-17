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
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { handleMutationResult } from "@/lib/mutation-result";

export interface CenterRegistrationState {
  competitionEntryRegistrationEnabled: boolean;
  id: string;
  name: string;
  studentRegistrationEnabled: boolean;
}

interface CenterRegistrationDialogProps {
  center: CenterRegistrationState | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function RegistrationForm({
  center,
  onOpenChange,
}: {
  center: CenterRegistrationState;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const selectRegistrationValues = useEventCallback(
    (state: {
      values: {
        competitionEntryRegistrationEnabled: boolean;
        studentRegistrationEnabled: boolean;
      };
    }) => ({
      competitionEntryRegistrationEnabled:
        state.values.competitionEntryRegistrationEnabled,
      studentRegistrationEnabled: state.values.studentRegistrationEnabled,
    })
  );
  const schema = useMemo(
    () =>
      z
        .object({
          competitionEntryRegistrationEnabled: z.boolean(),
          confirmReopen: z.boolean(),
          studentRegistrationEnabled: z.boolean(),
        })
        .superRefine((value, ctx) => {
          const reopens =
            (!center.studentRegistrationEnabled &&
              value.studentRegistrationEnabled) ||
            (!center.competitionEntryRegistrationEnabled &&
              value.competitionEntryRegistrationEnabled);
          if (reopens && !value.confirmReopen) {
            ctx.addIssue({
              code: "custom",
              message: "Confirm that registration should reopen",
              path: ["confirmReopen"],
            });
          }
        }),
    [center]
  );
  const form = useForm({
    defaultValues: {
      competitionEntryRegistrationEnabled:
        center.competitionEntryRegistrationEnabled,
      confirmReopen: false,
      studentRegistrationEnabled: center.studentRegistrationEnabled,
    },
    onSubmit: async ({ value }) => {
      const result = await zero.mutate(
        mutators.kalakritiCenter.setRegistrationControls({
          auditEntryId: uuidv7(),
          centerId: center.id,
          competitionEntryRegistrationEnabled:
            value.competitionEntryRegistrationEnabled,
          confirmReopen: value.confirmReopen,
          now: Date.now(),
          studentRegistrationEnabled: value.studentRegistrationEnabled,
        })
      ).server;
      handleMutationResult(result, {
        entityId: center.id,
        errorMsg: "Failed to update registration controls",
        mutation: "kalakritiCenter.setRegistrationControls",
        successMsg: "Registration controls updated",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: schema, onSubmit: schema },
  });

  return (
    <FormLayout form={form}>
      <CheckboxField
        description="Allows Guardians to add and edit students for this Center."
        label="Student registration"
        name="studentRegistrationEnabled"
      />
      <CheckboxField
        description="Allows competition participation entries for registered students."
        label="Event participation registration"
        name="competitionEntryRegistrationEnabled"
      />
      <form.Subscribe selector={selectRegistrationValues}>
        {(values) => {
          const reopens =
            (!center.studentRegistrationEnabled &&
              values.studentRegistrationEnabled) ||
            (!center.competitionEntryRegistrationEnabled &&
              values.competitionEntryRegistrationEnabled);
          return reopens ? (
            <CheckboxField
              description="Reopening is recorded in the Edition audit trail."
              isRequired
              label="I confirm registration should reopen"
              name="confirmReopen"
            />
          ) : null;
        }}
      </form.Subscribe>
      <FormActions
        onCancel={handleCancel}
        submitLabel="Save controls"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function CenterRegistrationDialog({
  center,
  onOpenChange,
  open,
}: CenterRegistrationDialogProps) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((key) => key + 1);
    }
    onOpenChange(nextOpen);
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registration controls</DialogTitle>
          <DialogDescription>
            Student and event participation registration are controlled
            independently for {center ? center.name : "this Center"}.
          </DialogDescription>
        </DialogHeader>
        {center ? (
          <RegistrationForm
            center={center}
            key={`${center.id}:${formKey}`}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
