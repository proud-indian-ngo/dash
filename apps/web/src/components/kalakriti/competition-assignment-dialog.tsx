import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useState } from "react";
import { CompetitionAssignmentForm } from "@/components/kalakriti/competition-assignment-form";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import type { PickerUser } from "@/functions/users-for-picker";

interface ScopeOption {
  id: string;
  name: string;
  retiredAt: number | null;
}

export function CompetitionAssignmentDialog({
  categories,
  categoriesState,
  competitions,
  competitionsState,
  editionId,
  onOpenChange,
  open,
  pickerState,
  users,
}: {
  categories: readonly ScopeOption[];
  categoriesState: "complete" | "error" | "unknown";
  competitions: readonly ScopeOption[];
  competitionsState: "complete" | "error" | "unknown";
  editionId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  pickerState: "error" | "idle" | "loading" | "ready";
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
          <DialogTitle>Assign competition role</DialogTitle>
          <DialogDescription>
            Scope Category Leads to one Category, and Coordinators or Volunteers
            to one Competition.
          </DialogDescription>
        </DialogHeader>
        <CompetitionAssignmentDialogBody
          categories={categories}
          categoriesState={categoriesState}
          competitions={competitions}
          competitionsState={competitionsState}
          editionId={editionId}
          formKey={formKey}
          onAssigned={handleAssigned}
          onCancel={handleCancel}
          pickerState={pickerState}
          users={users}
        />
      </DialogContent>
    </Dialog>
  );
}

function CompetitionAssignmentDialogBody({
  categories,
  categoriesState,
  competitions,
  competitionsState,
  editionId,
  formKey,
  onAssigned,
  onCancel,
  pickerState,
  users,
}: {
  categories: readonly ScopeOption[];
  categoriesState: "complete" | "error" | "unknown";
  competitions: readonly ScopeOption[];
  competitionsState: "complete" | "error" | "unknown";
  editionId: string;
  formKey: number;
  onAssigned: () => void;
  onCancel: () => void;
  pickerState: "error" | "idle" | "loading" | "ready";
  users: readonly PickerUser[];
}) {
  if (
    pickerState === "error" ||
    categoriesState === "error" ||
    competitionsState === "error"
  ) {
    return (
      <p className="text-destructive text-sm" role="alert">
        Competition assignment options could not be loaded. Refresh and try
        again.
      </p>
    );
  }
  if (
    pickerState === "ready" &&
    categoriesState === "complete" &&
    competitionsState === "complete"
  ) {
    return (
      <CompetitionAssignmentForm
        categories={categories}
        competitions={competitions}
        editionId={editionId}
        key={formKey}
        onAssigned={onAssigned}
        onCancel={onCancel}
        users={users}
      />
    );
  }
  return (
    <div
      aria-label="Loading Competition assignment options"
      className="flex min-h-24 items-center justify-center"
      role="status"
    >
      <Loader />
    </div>
  );
}
