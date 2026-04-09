import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { UserPicker } from "@/components/shared/user-picker";
import { handleMutationResult } from "@/lib/mutation-result";

const addMemberSchema = z.object({
  userIds: z.array(z.string()).min(1, "Select at least one volunteer"),
});

interface AddEventMemberDialogProps {
  eventId: string;
  existingMembers: ReadonlyArray<{ userId: string }>;
  /** Called before adding members. Returns the actual eventId to use (may differ if materialization happened). */
  onBeforeAdd?: () => Promise<string | null>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function AddEventMemberFormContent({
  eventId,
  existingMembers,
  onBeforeAdd,
  onOpenChange,
  open,
}: AddEventMemberDialogProps) {
  const zero = useZero();
  const [allUsers] = useQuery(queries.user.all(), { enabled: open });

  const eligibleUsers = (allUsers ?? []).filter((u) => u.isActive);

  const existingUserIds = new Set(existingMembers.map((m) => m.userId));

  const form = useForm({
    defaultValues: { userIds: [] as string[] },
    onSubmit: async ({ value }) => {
      // Materialize if this is a virtual occurrence
      const targetEventId = onBeforeAdd
        ? ((await onBeforeAdd()) ?? eventId)
        : eventId;

      const members = value.userIds.map((userId) => ({
        id: uuidv7(),
        userId,
      }));

      const res = await zero.mutate(
        mutators.teamEvent.addMembers({
          eventId: targetEventId,
          members,
          now: Date.now(),
        })
      ).server;

      const count = members.length;
      handleMutationResult(res, {
        mutation: "teamEvent.addMembers",
        entityId: eventId,
        successMsg:
          count === 1 ? "Volunteer added" : `${count} volunteers added`,
        errorMsg: "Failed to add volunteers",
      });

      onOpenChange(false);
    },
    validators: {
      onChange: addMemberSchema,
      onSubmit: addMemberSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <CustomField<string[]>
        isRequired
        label="Search volunteers"
        name="userIds"
      >
        {(field) => (
          <UserPicker
            emptyMessage="No matching volunteers found."
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
              count > 1 ? `Add ${count} Volunteers` : "Add Volunteer"
            }
            submittingLabel="Adding..."
          />
        )}
      </form.Subscribe>
    </FormLayout>
  );
}

export function AddEventMemberDialog({
  eventId,
  existingMembers,
  onBeforeAdd,
  onOpenChange,
  open,
}: AddEventMemberDialogProps) {
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
          <DialogTitle>Add Volunteer</DialogTitle>
          <DialogDescription className="sr-only">
            Add a volunteer to this event
          </DialogDescription>
        </DialogHeader>
        <AddEventMemberFormContent
          eventId={eventId}
          existingMembers={existingMembers}
          key={formKey}
          onBeforeAdd={onBeforeAdd}
          onOpenChange={onOpenChange}
          open={open}
        />
      </DialogContent>
    </Dialog>
  );
}
