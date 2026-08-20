import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { KalakritiEditionScopedResponsibility } from "@pi-dash/shared/kalakriti";
import { useState } from "react";
import { VolunteerAssignmentForm } from "@/components/kalakriti/volunteer-assignment-form";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import type { PickerUser } from "@/functions/users-for-picker";

export function VolunteerAssignmentDialog({
  editionId,
  onOpenChange,
  open,
  pickerState,
  responsibilities,
  users,
}: {
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pickerState: "error" | "idle" | "loading" | "ready";
  responsibilities: readonly KalakritiEditionScopedResponsibility[];
  users: readonly PickerUser[];
}) {
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((current) => current + 1);
    }
    onOpenChange(nextOpen);
  });
  const handleAssigned = useEventCallback(() => onOpenChange(false));
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign volunteer</DialogTitle>
          <DialogDescription>
            External Guardians are intentionally excluded from this picker.
          </DialogDescription>
        </DialogHeader>
        <VolunteerAssignmentDialogBody
          editionId={editionId}
          formKey={formKey}
          onAssigned={handleAssigned}
          onCancel={handleCancel}
          pickerState={pickerState}
          responsibilities={responsibilities}
          users={users}
        />
      </DialogContent>
    </Dialog>
  );
}

function VolunteerAssignmentDialogBody({
  editionId,
  formKey,
  onAssigned,
  onCancel,
  pickerState,
  responsibilities,
  users,
}: {
  editionId: string;
  formKey: number;
  onAssigned: () => void;
  onCancel: () => void;
  pickerState: "error" | "idle" | "loading" | "ready";
  responsibilities: readonly KalakritiEditionScopedResponsibility[];
  users: readonly PickerUser[];
}) {
  if (pickerState === "error") {
    return (
      <p className="text-destructive text-sm" role="alert">
        Central volunteers could not be loaded. Refresh and try again.
      </p>
    );
  }
  if (pickerState !== "ready") {
    return (
      <div
        aria-label="Loading central volunteers"
        className="flex min-h-24 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }
  return (
    <VolunteerAssignmentForm
      editionId={editionId}
      key={`${formKey}:${responsibilities.join(":")}`}
      onAssigned={onAssigned}
      onCancel={onCancel}
      responsibilities={responsibilities}
      users={users}
    />
  );
}
