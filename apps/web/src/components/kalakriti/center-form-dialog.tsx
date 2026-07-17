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

const centerFormSchema = z.object({
  name: z.string().trim().min(2, "Enter at least two characters").max(120),
});

interface CenterFormDialogProps {
  center?: { id: string; name: string };
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function CenterForm({
  center,
  editionId,
  onOpenChange,
}: Omit<CenterFormDialogProps, "open">) {
  const zero = useZero();
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: { name: center?.name ?? "" },
    onSubmit: async ({ value }) => {
      const centerId = center?.id ?? uuidv7();
      const result = center
        ? await zero.mutate(
            mutators.kalakritiCenter.update({
              auditEntryId: uuidv7(),
              centerId,
              name: value.name,
              now: Date.now(),
            })
          ).server
        : await zero.mutate(
            mutators.kalakritiCenter.create({
              auditEntryId: uuidv7(),
              centerId,
              editionId,
              name: value.name,
              now: Date.now(),
            })
          ).server;
      handleMutationResult(result, {
        entityId: centerId,
        errorMsg: center
          ? "Failed to update Center"
          : "Failed to create Center",
        mutation: center ? "kalakritiCenter.update" : "kalakritiCenter.create",
        successMsg: center ? "Center updated" : "Center created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: centerFormSchema, onSubmit: centerFormSchema },
  });

  return (
    <FormLayout form={form}>
      <InputField
        autoFocus
        isRequired
        label="Center name"
        name="name"
        placeholder="Jayanagar"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel={center ? "Save Center" : "Create Center"}
        submittingLabel={center ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

export function CenterFormDialog(props: CenterFormDialogProps) {
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
          <DialogTitle>
            {props.center ? "Edit Center" : "Add Center"}
          </DialogTitle>
          <DialogDescription>
            Center names are unique within this Kalakriti Edition.
          </DialogDescription>
        </DialogHeader>
        <CenterForm {...props} key={formKey} />
      </DialogContent>
    </Dialog>
  );
}
