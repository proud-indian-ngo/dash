import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { UserPicker } from "@/components/shared/user-picker";
import type { PickerUser } from "@/functions/users-for-picker";
import { handleMutationResult } from "@/lib/mutation-result";

const addVolunteersSchema = z.object({
  userIds: z.array(z.string()).min(1, "Select at least one volunteer"),
});

export function KalakritiAddVolunteersDialog({
  editionId,
  excludeUserIds,
  onOpenChange,
  open,
  pickerState,
  users,
}: {
  editionId: string;
  excludeUserIds?: ReadonlySet<string>;
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
  const handleAdded = useEventCallback(() => onOpenChange(false));
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add volunteers</DialogTitle>
          <DialogDescription>
            Add central volunteers to this Edition roster without assigning a
            role. Unoriented volunteers stay Unassigned until orientation.
          </DialogDescription>
        </DialogHeader>
        <AddVolunteersDialogBody
          editionId={editionId}
          excludeUserIds={excludeUserIds}
          formKey={formKey}
          onAdded={handleAdded}
          onCancel={handleCancel}
          pickerState={pickerState}
          users={users}
        />
      </DialogContent>
    </Dialog>
  );
}

function AddVolunteersDialogBody({
  editionId,
  excludeUserIds,
  formKey,
  onAdded,
  onCancel,
  pickerState,
  users,
}: {
  editionId: string;
  excludeUserIds?: ReadonlySet<string>;
  formKey: number;
  onAdded: () => void;
  onCancel: () => void;
  pickerState: "error" | "idle" | "loading" | "ready";
  users: readonly PickerUser[];
}) {
  if (pickerState === "error") {
    return (
      <p className="text-destructive text-sm" role="alert">
        Volunteers could not be loaded. Refresh and try again.
      </p>
    );
  }
  if (pickerState === "ready") {
    return (
      <KalakritiAddVolunteersForm
        editionId={editionId}
        excludeUserIds={excludeUserIds}
        key={formKey}
        onAdded={onAdded}
        onCancel={onCancel}
        users={users}
      />
    );
  }
  return (
    <div
      aria-label="Loading volunteers"
      className="flex min-h-24 items-center justify-center"
      role="status"
    >
      <Loader />
    </div>
  );
}

function KalakritiAddVolunteersForm({
  editionId,
  excludeUserIds,
  onAdded,
  onCancel,
  users,
}: {
  editionId: string;
  excludeUserIds?: ReadonlySet<string>;
  onAdded: () => void;
  onCancel: () => void;
  users: readonly PickerUser[];
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: { userIds: [] as string[] },
    onSubmit: async ({ value }) => {
      const auditEntryId = uuidv7();
      const result = await zero.mutate(
        mutators.kalakritiAssignment.addVolunteers({
          auditEntryId,
          editionId,
          now: Date.now(),
          volunteers: value.userIds.map((userId) => ({
            membershipId: uuidv7(),
            teamEventMemberId: uuidv7(),
            userId,
          })),
        })
      ).server;
      handleMutationResult(result, {
        entityId: auditEntryId,
        errorMsg: "Failed to add volunteers",
        mutation: "kalakritiAssignment.addVolunteers",
        successMsg: "Volunteers added",
      });
      if (result.type !== "error") {
        onAdded();
        form.reset();
      }
    },
    validators: {
      onChange: addVolunteersSchema,
      onSubmit: addVolunteersSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <CustomField<string[]> isRequired label="Volunteers" name="userIds">
        {(field) => (
          <UserPicker
            emptyMessage="No matching central volunteers found."
            excludeUserIds={excludeUserIds}
            onValueChange={field.handleChange}
            placeholder="Search central volunteers..."
            users={users}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>
      <FormActions
        onCancel={onCancel}
        submitLabel="Add volunteers"
        submittingLabel="Adding..."
      />
    </FormLayout>
  );
}
