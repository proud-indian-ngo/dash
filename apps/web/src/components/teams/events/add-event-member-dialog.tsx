import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { UserPicker } from "@/components/shared/user-picker";

const addMemberSchema = z.object({
  userIds: z.array(z.string()).min(1, "Select at least one volunteer"),
});

interface AddEventMemberDialogProps {
  eventId: string;
  existingMembers: ReadonlyArray<{ userId: string }>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function AddEventMemberDialog({
  eventId,
  existingMembers,
  onOpenChange,
  open,
}: AddEventMemberDialogProps) {
  const zero = useZero();
  const [allUsers] = useQuery(queries.user.all());
  const prevOpenRef = useRef(false);

  const existingUserIds = useMemo(
    () => new Set(existingMembers.map((m) => m.userId)),
    [existingMembers]
  );

  const form = useForm({
    defaultValues: { userIds: [] as string[] },
    onSubmit: async ({ value }) => {
      const members = value.userIds.map((userId) => ({
        id: crypto.randomUUID(),
        userId,
      }));

      const res = await zero.mutate(
        mutators.teamEvent.addMembers({ eventId, members })
      ).server;

      if (res.type === "error") {
        toast.error("Failed to add volunteers");
      } else {
        const count = members.length;
        toast.success(
          count === 1 ? "Volunteer added" : `${count} volunteers added`
        );
      }

      onOpenChange(false);
    },
    validators: {
      onSubmit: addMemberSchema,
    },
  });

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      form.reset();
    }
    prevOpenRef.current = open;
  }, [open, form]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        form.reset();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, form]
  );

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Volunteer</DialogTitle>
        </DialogHeader>
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
                users={allUsers ?? []}
                value={field.state.value ?? []}
              />
            )}
          </CustomField>
          <form.Subscribe selector={(state) => state.values.userIds.length}>
            {(count) => (
              <FormActions
                onCancel={() => handleOpenChange(false)}
                submitLabel={
                  count > 1 ? `Add ${count} Volunteers` : "Add Volunteer"
                }
                submittingLabel="Adding..."
              />
            )}
          </form.Subscribe>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
