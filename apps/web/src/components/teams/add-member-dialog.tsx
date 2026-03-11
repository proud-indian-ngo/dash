import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { TeamMember } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { UserPicker } from "@/components/shared/user-picker";

const addTeamMemberSchema = z.object({
  userIds: z.array(z.string()).min(1, "Select at least one member"),
  role: z.enum(["member", "lead"]),
});

interface AddMemberDialogProps {
  existingMembers: readonly TeamMember[];
  isAdmin: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  teamId: string;
}

export function AddMemberDialog({
  existingMembers,
  isAdmin,
  onOpenChange,
  open,
  teamId,
}: AddMemberDialogProps) {
  const zero = useZero();
  const [allUsers] = useQuery(queries.user.all());
  const prevOpenRef = useRef(false);

  const existingUserIds = useMemo(
    () => new Set(existingMembers.map((m) => m.userId)),
    [existingMembers]
  );

  const form = useForm({
    defaultValues: {
      userIds: [] as string[],
      role: "member" as "member" | "lead",
    },
    onSubmit: async ({ value }) => {
      const effectiveRole = value.userIds.length > 1 ? "member" : value.role;
      const results = await Promise.all(
        value.userIds.map(
          (userId) =>
            zero.mutate(
              mutators.team.addMember({
                id: crypto.randomUUID(),
                teamId,
                userId,
                role: effectiveRole,
              })
            ).server
        )
      );
      const failed = results.filter((r) => r.type === "error").length;
      if (failed > 0) {
        toast.error(`Failed to add ${failed} member(s)`);
      } else {
        const count = value.userIds.length;
        toast.success(count === 1 ? "Member added" : `${count} members added`);
      }
      onOpenChange(false);
    },
    validators: {
      onSubmit: addTeamMemberSchema,
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
          <DialogTitle>Add Member</DialogTitle>
        </DialogHeader>
        <FormLayout form={form}>
          <CustomField<string[]> isRequired label="Search users" name="userIds">
            {(field) => (
              <UserPicker
                excludeUserIds={existingUserIds}
                onValueChange={(ids) => field.handleChange(ids)}
                users={allUsers ?? []}
                value={field.state.value ?? []}
              />
            )}
          </CustomField>
          <form.Subscribe selector={(state) => state.values.userIds.length}>
            {(count) => (
              <>
                {isAdmin && count === 1 ? (
                  <SelectField
                    label="Role"
                    name="role"
                    options={[
                      { label: "Member", value: "member" },
                      { label: "Lead", value: "lead" },
                    ]}
                  />
                ) : null}
                <FormActions
                  onCancel={() => handleOpenChange(false)}
                  submitLabel={
                    count > 1 ? `Add ${count} Members` : "Add Member"
                  }
                  submittingLabel="Adding..."
                />
              </>
            )}
          </form.Subscribe>
        </FormLayout>
      </DialogContent>
    </Dialog>
  );
}
