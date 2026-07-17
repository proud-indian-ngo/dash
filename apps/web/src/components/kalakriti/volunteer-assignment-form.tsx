import {
  KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiEditionScopedResponsibility,
} from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useCallback } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { CheckboxField } from "@/components/form/checkbox-field";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { UserPicker } from "@/components/shared/user-picker";
import type { PickerUser } from "@/functions/users-for-picker";
import { handleMutationResult } from "@/lib/mutation-result";

const assignmentFormSchema = z.object({
  makePrimary: z.boolean(),
  responsibility: z.enum(KALAKRITI_EDITION_SCOPED_RESPONSIBILITIES),
  userIds: z.array(z.string()).length(1, "Select one volunteer"),
});

interface VolunteerAssignmentFormProps {
  editionId: string;
  responsibilities: readonly KalakritiEditionScopedResponsibility[];
  users: readonly PickerUser[];
}

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
    (userIds: string[]) => {
      onValueChange(userIds.slice(-1));
    },
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

export function VolunteerAssignmentForm({
  editionId,
  responsibilities,
  users,
}: VolunteerAssignmentFormProps) {
  const zero = useZero();
  const form = useForm({
    defaultValues: {
      makePrimary: false,
      responsibility: responsibilities[0] ?? "overall_events_lead",
      userIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      const [userId] = value.userIds;
      if (!userId) {
        return;
      }
      const assignmentId = uuidv7();
      const res = await zero.mutate(
        mutators.kalakritiAssignment.assignVolunteer({
          assignmentId,
          auditEntryId: uuidv7(),
          editionId,
          makePrimary: value.makePrimary,
          membershipId: uuidv7(),
          now: currentTimestamp(),
          responsibility: value.responsibility,
          teamEventMemberId: uuidv7(),
          userId,
        })
      ).server;
      handleMutationResult(res, {
        entityId: assignmentId,
        errorMsg: "Failed to assign volunteer",
        mutation: "kalakritiAssignment.assignVolunteer",
        successMsg: "Volunteer assigned",
      });
      if (res.type !== "error") {
        form.reset();
      }
    },
    validators: {
      onChange: assignmentFormSchema,
      onSubmit: assignmentFormSchema,
    },
  });

  return (
    <FormLayout className="grid gap-4 md:grid-cols-2" form={form}>
      <CustomField<string[]> isRequired label="Volunteer" name="userIds">
        {(field) => (
          <SingleVolunteerPicker
            onValueChange={field.handleChange}
            users={users}
            value={field.state.value ?? []}
          />
        )}
      </CustomField>
      <SelectField
        isRequired
        label="Responsibility"
        name="responsibility"
        options={responsibilities.map((responsibility) => ({
          label: KALAKRITI_RESPONSIBILITY_LABELS[responsibility],
          value: responsibility,
        }))}
      />
      <CheckboxField
        className="rounded-none border p-3 md:col-span-2"
        description="The first responsibility is automatically used on the volunteer card."
        label="Use as primary card label"
        name="makePrimary"
      />
      <FormActions
        className="md:col-span-2"
        submitLabel="Assign volunteer"
        submittingLabel="Assigning..."
      />
    </FormLayout>
  );
}
