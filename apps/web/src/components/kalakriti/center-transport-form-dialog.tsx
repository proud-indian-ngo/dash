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
import { TextareaField } from "@/components/form/textarea-field";
import type { CenterTransportAssignment } from "@/components/kalakriti/center-transport-section";
import { handleMutationResult } from "@/lib/mutation-result";

const transportFormSchema = z.object({
  capacity: z.number().int().positive("Capacity must be positive"),
  driverName: z.string().trim().min(1, "Driver name is required").max(120),
  driverPhone: z.string().trim().max(40),
  notes: z.string().trim().max(500),
  vehicleLabel: z.string().trim().min(1, "Vehicle name is required").max(120),
});

interface CenterTransportFormDialogProps {
  assignment: CenterTransportAssignment | null;
  centerId: string;
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function TransportForm({
  assignment,
  centerId,
  editionId,
  onOpenChange,
}: Omit<CenterTransportFormDialogProps, "open">) {
  const zero = useZero();
  const isEditing = assignment !== null;
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const form = useForm({
    defaultValues: {
      capacity: assignment?.capacity ?? 40,
      driverName: assignment?.driverName ?? "",
      driverPhone: assignment?.driverPhone ?? "",
      notes: assignment?.notes ?? "",
      vehicleLabel: assignment?.vehicleLabel ?? "",
    },
    onSubmit: async ({ value }) => {
      const now = Date.now();
      const driverPhone = value.driverPhone.trim()
        ? value.driverPhone.trim()
        : null;
      const notes = value.notes.trim() ? value.notes.trim() : null;
      const result = isEditing
        ? await zero.mutate(
            mutators.kalakritiTransport.update({
              assignmentId: assignment.id,
              auditEntryId: uuidv7(),
              capacity: value.capacity,
              changeId: uuidv7(),
              driverName: value.driverName,
              driverPhone,
              editionId,
              notes,
              now,
              vehicleLabel: value.vehicleLabel,
            })
          ).server
        : await zero.mutate(
            mutators.kalakritiTransport.create({
              assignmentId: uuidv7(),
              auditEntryId: uuidv7(),
              capacity: value.capacity,
              centerId,
              driverName: value.driverName,
              driverPhone,
              editionId,
              historyId: uuidv7(),
              notes,
              now,
              vehicleLabel: value.vehicleLabel,
            })
          ).server;
      handleMutationResult(result, {
        entityId: assignment?.id ?? centerId,
        errorMsg: isEditing
          ? "Failed to update transport assignment"
          : "Failed to create transport assignment",
        mutation: isEditing
          ? "kalakritiTransport.update"
          : "kalakritiTransport.create",
        successMsg: isEditing
          ? "Transport assignment updated"
          : "Transport assignment created",
      });
      if (result.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: transportFormSchema,
      onSubmit: transportFormSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <InputField
        autoFocus
        isRequired
        label="Vehicle"
        name="vehicleLabel"
        placeholder="Bus 1"
      />
      <InputField
        isRequired
        label="Driver name"
        name="driverName"
        placeholder="Driver name"
      />
      <InputField
        label="Driver phone"
        name="driverPhone"
        placeholder="Optional"
      />
      <InputField
        inputMode="numeric"
        isRequired
        label="Capacity"
        name="capacity"
        placeholder="40"
        type="number"
      />
      <TextareaField
        label="Notes"
        name="notes"
        placeholder="Optional pickup notes"
      />
      <FormActions
        onCancel={handleCancel}
        submitLabel={isEditing ? "Save changes" : "Add vehicle"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function CenterTransportFormDialog({
  assignment,
  centerId,
  editionId,
  onOpenChange,
  open,
}: CenterTransportFormDialogProps) {
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
          <DialogTitle>
            {assignment
              ? "Edit transport assignment"
              : "Add transport assignment"}
          </DialogTitle>
          <DialogDescription>
            Guardians and Liaisons are notified when the vehicle or driver
            details change.
          </DialogDescription>
        </DialogHeader>
        <TransportForm
          assignment={assignment}
          centerId={centerId}
          editionId={editionId}
          key={formKey}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
