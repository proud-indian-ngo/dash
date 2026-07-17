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

const quotaSchema = z.object({
  femaleStudentLimit: z.number().int().min(0),
  maleStudentLimit: z.number().int().min(0),
});

export interface CenterAgeQuotaSelection {
  ageCategoryId: string;
  ageCategoryName: string;
  centerId: string;
  centerName: string;
  femaleStudentLimit: number | null;
  maleStudentLimit: number | null;
  quotaId: string | null;
}

interface CenterAgeQuotaDialogProps {
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  selection: CenterAgeQuotaSelection | null;
}

function CenterAgeQuotaForm({
  editionId,
  onOpenChange,
  selection,
}: Omit<CenterAgeQuotaDialogProps, "open">) {
  const zero = useZero();
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      femaleStudentLimit: selection?.femaleStudentLimit ?? 0,
      maleStudentLimit: selection?.maleStudentLimit ?? 0,
    },
    onSubmit: async ({ value }) => {
      if (!selection) {
        return;
      }
      const quotaId = selection.quotaId ?? uuidv7();
      const result = await zero.mutate(
        mutators.kalakritiEligibility.setQuota({
          ...value,
          ageCategoryId: selection.ageCategoryId,
          auditEntryId: uuidv7(),
          centerId: selection.centerId,
          editionId,
          now: Date.now(),
          quotaId,
        })
      ).server;
      handleMutationResult(result, {
        entityId: quotaId,
        errorMsg: "Failed to save Center quota",
        mutation: "kalakritiEligibility.setQuota",
        successMsg: "Center quota saved",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: quotaSchema, onSubmit: quotaSchema },
  });
  return (
    <FormLayout form={form}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <InputField
          autoFocus
          isRequired
          label="Male Student limit"
          name="maleStudentLimit"
          type="number"
        />
        <InputField
          isRequired
          label="Female Student limit"
          name="femaleStudentLimit"
          type="number"
        />
      </div>
      <FormActions
        onCancel={handleCancel}
        submitLabel="Save Quota"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function CenterAgeQuotaDialog(props: CenterAgeQuotaDialogProps) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (open) {
      setFormKey((key) => key + 1);
    }
    props.onOpenChange(open);
  });
  return (
    <Dialog onOpenChange={handleOpenChange} open={props.open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Center Student quota</DialogTitle>
          <DialogDescription>
            {props.selection
              ? `${props.selection.centerName} · ${props.selection.ageCategoryName}`
              : "Set the male and female Student limits."}
          </DialogDescription>
        </DialogHeader>
        <CenterAgeQuotaForm key={formKey} {...props} />
      </DialogContent>
    </Dialog>
  );
}
