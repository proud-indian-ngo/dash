import { mutators } from "@pi-dash/zero/mutators";
import type { CenterCoordinator } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { UserPicker } from "@/components/shared/user-picker";
import {
  getUsersForPicker,
  type PickerUser,
} from "@/functions/users-for-picker";

const addCoordinatorSchema = z.object({
  userIds: z.array(z.string()).min(1, "Select at least one coordinator"),
});

interface AddCoordinatorDialogProps {
  centerId: string;
  existingCoordinators: readonly CenterCoordinator[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function AddCoordinatorFormContent({
  existingCoordinators,
  onOpenChange,
  open,
  centerId,
}: AddCoordinatorDialogProps) {
  const zero = useZero();
  const [allUsers, setAllUsers] = useState<PickerUser[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    getUsersForPicker().then(setAllUsers);
  }, [open]);

  const eligibleUsers = allUsers.filter(
    (u) => u.role === "center_coordinator" && u.isActive
  );

  const existingUserIds = new Set(existingCoordinators.map((c) => c.userId));

  const form = useForm({
    defaultValues: {
      userIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      const results = await Promise.all(
        value.userIds.map(
          (userId) =>
            zero.mutate(
              mutators.center.assignCoordinator({
                id: uuidv7(),
                centerId,
                userId,
                now: Date.now(),
              })
            ).server
        )
      );
      const failed = results.filter((r) => r.type === "error").length;
      if (failed > 0) {
        toast.error(`Couldn't add ${failed} coordinator(s)`);
      } else {
        const count = value.userIds.length;
        toast.success(
          count === 1 ? "Coordinator added!" : `${count} coordinators added!`
        );
      }
      onOpenChange(false);
    },
    validators: {
      onChange: addCoordinatorSchema,
      onSubmit: addCoordinatorSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <CustomField<string[]> isRequired label="Search users" name="userIds">
        {(field) => (
          <UserPicker
            excludeUserIds={existingUserIds}
            onValueChange={(ids) => field.handleChange(ids)}
            users={eligibleUsers}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>
      <form.Subscribe selector={(state) => state.values.userIds.length}>
        {(count) => (
          <FormActions
            onCancel={() => onOpenChange(false)}
            submitLabel={
              count > 1 ? `Add ${count} Coordinators` : "Add Coordinator"
            }
            submittingLabel="Adding..."
          />
        )}
      </form.Subscribe>
    </FormLayout>
  );
}

export function AddCoordinatorDialog({
  existingCoordinators,
  onOpenChange,
  open,
  centerId,
}: AddCoordinatorDialogProps) {
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Coordinator</DialogTitle>
          <DialogDescription className="sr-only">
            Add a coordinator to this center
          </DialogDescription>
        </DialogHeader>
        <AddCoordinatorFormContent
          centerId={centerId}
          existingCoordinators={existingCoordinators}
          key={formKey}
          onOpenChange={onOpenChange}
          open={open}
        />
      </DialogContent>
    </Dialog>
  );
}
