import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { KalakritiResponsibility } from "@pi-dash/shared/kalakriti";
import { useState } from "react";
import { KalakritiRoleAssignmentForm } from "@/components/kalakriti/kalakriti-role-assignment-form";
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
  retiredAt?: number | null;
}

export function KalakritiRoleAssignmentDialog({
  actorResponsibilities,
  categories,
  categoriesState,
  centers,
  competitions,
  competitionsState,
  editionId,
  initialUserId,
  isGlobalAdmin,
  onOpenChange,
  open,
  pickerState,
  users,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  categories: readonly ScopeOption[];
  categoriesState: "complete" | "error" | "unknown";
  centers: readonly ScopeOption[];
  competitions: readonly ScopeOption[];
  competitionsState: "complete" | "error" | "unknown";
  editionId: string;
  initialUserId?: string | null;
  isGlobalAdmin: boolean;
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
          <DialogTitle>Assign role</DialogTitle>
          <DialogDescription>
            Pick a volunteer, choose a role, then add a Center, Category, or
            Competition scope when required. External Guardians stay out of this
            picker.
          </DialogDescription>
        </DialogHeader>
        <KalakritiRoleAssignmentDialogBody
          actorResponsibilities={actorResponsibilities}
          categories={categories}
          categoriesState={categoriesState}
          centers={centers}
          competitions={competitions}
          competitionsState={competitionsState}
          editionId={editionId}
          formKey={formKey}
          initialUserId={initialUserId}
          isGlobalAdmin={isGlobalAdmin}
          onAssigned={handleAssigned}
          onCancel={handleCancel}
          pickerState={pickerState}
          users={users}
        />
      </DialogContent>
    </Dialog>
  );
}

function KalakritiRoleAssignmentDialogBody({
  actorResponsibilities,
  categories,
  categoriesState,
  centers,
  competitions,
  competitionsState,
  editionId,
  formKey,
  initialUserId,
  isGlobalAdmin,
  onAssigned,
  onCancel,
  pickerState,
  users,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  categories: readonly ScopeOption[];
  categoriesState: "complete" | "error" | "unknown";
  centers: readonly ScopeOption[];
  competitions: readonly ScopeOption[];
  competitionsState: "complete" | "error" | "unknown";
  editionId: string;
  formKey: number;
  initialUserId?: string | null;
  isGlobalAdmin: boolean;
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
        Assignment options could not be loaded. Refresh and try again.
      </p>
    );
  }

  if (pickerState !== "ready") {
    return (
      <div
        aria-label="Loading assignment options"
        className="flex min-h-24 items-center justify-center"
        role="status"
      >
        <Loader />
      </div>
    );
  }

  return (
    <KalakritiRoleAssignmentForm
      actorResponsibilities={actorResponsibilities}
      categories={categories}
      centers={centers}
      competitions={competitions}
      editionId={editionId}
      initialUserId={initialUserId}
      isGlobalAdmin={isGlobalAdmin}
      key={`${formKey}:${initialUserId ?? "new"}`}
      onAssigned={onAssigned}
      onCancel={onCancel}
      users={users}
    />
  );
}
