import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useCallback } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { UserPicker } from "@/components/shared/user-picker";
import { assignKalakritiGuardianCenter } from "@/functions/kalakriti-guardian";
import type { PickerUser } from "@/functions/users-for-picker";
import { handleMutationResult } from "@/lib/mutation-result";

const guardianAssignmentSchema = z.object({
  membershipId: z.string().min(1, "Select a Guardian"),
});

export function GuardianCenterAssignmentForm({
  centerId,
  guardians,
}: {
  centerId: string;
  guardians: readonly { id: string; name: string }[];
}) {
  const form = useForm({
    defaultValues: { membershipId: "" },
    onSubmit: async ({ value }) => {
      try {
        const result = await assignKalakritiGuardianCenter({
          data: { centerId, membershipId: value.membershipId },
        });
        handleMutationResult(
          { type: "success" },
          {
            entityId: result.guardianCenterId,
            errorMsg: "Failed to assign Guardian",
            mutation: "assignKalakritiGuardianCenter",
            successMsg: "Guardian assigned",
          }
        );
        form.reset();
      } catch (error) {
        handleMutationResult(
          { error, type: "error" },
          {
            entityId: value.membershipId,
            errorMsg: "Failed to assign Guardian",
            mutation: "assignKalakritiGuardianCenter",
          }
        );
      }
    },
    validators: {
      onChange: guardianAssignmentSchema,
      onSubmit: guardianAssignmentSchema,
    },
  });

  return (
    <FormLayout
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      form={form}
    >
      <SelectField
        isRequired
        label="Guardian"
        name="membershipId"
        options={guardians.map((guardian) => ({
          label: guardian.name,
          value: guardian.id,
        }))}
        placeholder="Select Guardian"
        triggerClassName="w-full sm:w-64"
      />
      <FormActions
        disabled={guardians.length === 0}
        submitLabel="Assign Guardian"
        submittingLabel="Assigning..."
      />
    </FormLayout>
  );
}

const liaisonAssignmentSchema = z.object({
  userIds: z.array(z.string()).length(1, "Select one volunteer"),
});

function currentTimestamp(): number {
  return Date.now();
}

function SingleVolunteerPicker({
  onValueChange,
  users,
  value,
}: {
  onValueChange: (userIds: string[]) => void;
  users: readonly PickerUser[];
  value: string[];
}) {
  const handleValueChange = useCallback(
    (userIds: string[]) => onValueChange(userIds.slice(-1)),
    [onValueChange]
  );
  return (
    <UserPicker
      emptyMessage="No matching central volunteers found."
      onValueChange={handleValueChange}
      placeholder="Search central volunteers..."
      users={users}
      value={value}
    />
  );
}

export function LiaisonCenterAssignmentForm({
  centerId,
  editionId,
  users,
}: {
  centerId: string;
  editionId: string;
  users: readonly PickerUser[];
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: { userIds: [] as string[] },
    onSubmit: async ({ value }) => {
      const [userId] = value.userIds;
      if (!userId) {
        return;
      }
      const assignmentId = uuidv7();
      const result = await zero.mutate(
        mutators.kalakritiAssignment.assignLiaison({
          assignmentId,
          auditEntryId: uuidv7(),
          centerId,
          editionId,
          makePrimary: false,
          membershipId: uuidv7(),
          now: currentTimestamp(),
          teamEventMemberId: uuidv7(),
          userId,
        })
      ).server;
      handleMutationResult(result, {
        entityId: assignmentId,
        errorMsg: "Failed to assign Liaison",
        mutation: "kalakritiAssignment.assignLiaison",
        successMsg: "Liaison assigned",
      });
      if (result.type !== "error") {
        form.reset();
      }
    },
    validators: {
      onChange: liaisonAssignmentSchema,
      onSubmit: liaisonAssignmentSchema,
    },
  });

  return (
    <FormLayout
      className="flex flex-col gap-3 sm:flex-row sm:items-end"
      form={form}
    >
      <CustomField<string[]>
        isRequired
        label="Central volunteer"
        name="userIds"
      >
        {(field) => (
          <SingleVolunteerPicker
            onValueChange={field.handleChange}
            users={users}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>
      <FormActions
        submitLabel="Assign Liaison"
        submittingLabel="Assigning..."
      />
    </FormLayout>
  );
}
