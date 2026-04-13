import { mutators } from "@pi-dash/zero/mutators";
import type { TeamMember } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
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

const addTeamMemberSchema = z.object({
  userIds: z.array(z.string()).min(1, "Select at least one member"),
  role: z.enum(["member", "lead"]),
});

interface AddMemberDialogProps {
  canSetRole: boolean;
  existingMembers: readonly TeamMember[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  teamId: string;
}

function AddMemberFormContent({
  existingMembers,
  canSetRole,
  onOpenChange,
  open,
  teamId,
}: AddMemberDialogProps) {
  const zero = useZero();
  const [allUsers, setAllUsers] = useState<PickerUser[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    getUsersForPicker().then(setAllUsers);
  }, [open]);

  const eligibleUsers = allUsers.filter(
    (u) => u.role !== "unoriented_volunteer" && u.isActive
  );

  const existingUserIds = new Set(existingMembers.map((m) => m.userId));

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
                id: uuidv7(),
                teamId,
                userId,
                role: effectiveRole,
              })
            ).server
        )
      );
      const failed = results.filter((r) => r.type === "error").length;
      if (failed > 0) {
        toast.error(`Couldn't add ${failed} member(s)`);
      } else {
        const count = value.userIds.length;
        toast.success(
          count === 1 ? "Member added!" : `${count} members added!`
        );
      }
      onOpenChange(false);
    },
    validators: {
      onChange: addTeamMemberSchema,
      onSubmit: addTeamMemberSchema,
    },
  });

  return (
    <FormLayout form={form}>
      <CustomField<string[]> isRequired label="Search users" name="userIds">
        {(field) => (
          <>
            <UserPicker
              excludeUserIds={existingUserIds}
              onValueChange={(ids) => field.handleChange(ids)}
              users={eligibleUsers}
              value={field.state.value ?? []}
            />
            {(field.state.value?.length ?? 0) > 1 ? (
              <p className="text-muted-foreground text-xs">
                All added as Member
              </p>
            ) : null}
          </>
        )}
      </CustomField>
      <form.Subscribe selector={(state) => state.values.userIds.length}>
        {(count) => (
          <>
            {canSetRole && count === 1 ? (
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
              onCancel={() => onOpenChange(false)}
              submitLabel={count > 1 ? `Add ${count} Members` : "Add Member"}
              submittingLabel="Adding..."
            />
          </>
        )}
      </form.Subscribe>
    </FormLayout>
  );
}

export function AddMemberDialog({
  existingMembers,
  canSetRole,
  onOpenChange,
  open,
  teamId,
}: AddMemberDialogProps) {
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
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription className="sr-only">
            Add a member to this team
          </DialogDescription>
        </DialogHeader>
        <AddMemberFormContent
          canSetRole={canSetRole}
          existingMembers={existingMembers}
          key={formKey}
          onOpenChange={onOpenChange}
          open={open}
          teamId={teamId}
        />
      </DialogContent>
    </Dialog>
  );
}
