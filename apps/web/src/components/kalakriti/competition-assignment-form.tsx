import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  KALAKRITI_COMPETITION_CATEGORY_SCOPED_RESPONSIBILITIES,
  KALAKRITI_COMPETITION_SCOPED_RESPONSIBILITIES,
  KALAKRITI_RESPONSIBILITY_LABELS,
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

const scopedResponsibilities = [
  ...KALAKRITI_COMPETITION_CATEGORY_SCOPED_RESPONSIBILITIES,
  ...KALAKRITI_COMPETITION_SCOPED_RESPONSIBILITIES,
] as const;
type ScopedResponsibility = (typeof scopedResponsibilities)[number];

const assignmentSchema = z
  .object({
    competitionCategoryId: z.string(),
    competitionId: z.string(),
    makePrimary: z.boolean(),
    responsibility: z.enum(scopedResponsibilities),
    userIds: z.array(z.string()).length(1, "Select one volunteer"),
  })
  .superRefine((value, context) => {
    const field =
      value.responsibility === "competition_category_lead"
        ? "competitionCategoryId"
        : "competitionId";
    if (!value[field]) {
      context.addIssue({
        code: "custom",
        message:
          field === "competitionCategoryId"
            ? "Select a Competition Category"
            : "Select a Competition",
        path: [field],
      });
    }
  });

interface ScopeOption {
  id: string;
  name: string;
  retiredAt: number | null;
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

export function CompetitionAssignmentForm({
  categories,
  competitions,
  editionId,
  users,
}: {
  categories: readonly ScopeOption[];
  competitions: readonly ScopeOption[];
  editionId: string;
  users: readonly PickerUser[];
}) {
  const zero = useZero();
  const selectResponsibility = useEventCallback(
    (state: {
      values: { responsibility: (typeof scopedResponsibilities)[number] };
    }) => state.values.responsibility
  );
  const form = useForm({
    defaultValues: {
      competitionCategoryId: "",
      competitionId: "",
      makePrimary: false,
      responsibility: "competition_category_lead" as ScopedResponsibility,
      userIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      const [userId] = value.userIds;
      if (!userId) {
        return;
      }
      const assignmentId = uuidv7();
      const common = {
        assignmentId,
        auditEntryId: uuidv7(),
        editionId,
        makePrimary: value.makePrimary,
        membershipId: uuidv7(),
        now: Date.now(),
        teamEventMemberId: uuidv7(),
        userId,
      };
      const result =
        value.responsibility === "competition_category_lead"
          ? await zero.mutate(
              mutators.kalakritiAssignment.assignCompetitionCategoryLead({
                ...common,
                competitionCategoryId: value.competitionCategoryId,
                responsibility: value.responsibility,
              })
            ).server
          : await zero.mutate(
              mutators.kalakritiAssignment.assignCompetitionMember({
                ...common,
                competitionId: value.competitionId,
                responsibility: value.responsibility,
              })
            ).server;
      handleMutationResult(result, {
        entityId: assignmentId,
        errorMsg: "Failed to assign Competition responsibility",
        mutation: "kalakritiAssignment.assignCompetitionScope",
        successMsg: "Competition responsibility assigned",
      });
      if (result.type !== "error") {
        form.reset();
      }
    },
    validators: { onChange: assignmentSchema, onSubmit: assignmentSchema },
  });

  return (
    <FormLayout className="grid gap-4 md:grid-cols-2" form={form}>
      <CustomField<string[]> isRequired label="Volunteer" name="userIds">
        {(field) => (
          <SingleVolunteerPicker
            onValueChange={field.handleChange}
            users={users}
            value={field.state.value || []}
          />
        )}
      </CustomField>
      <SelectField
        isRequired
        label="Responsibility"
        name="responsibility"
        options={scopedResponsibilities.map((responsibility) => ({
          label: KALAKRITI_RESPONSIBILITY_LABELS[responsibility],
          value: responsibility,
        }))}
      />
      <form.Subscribe selector={selectResponsibility}>
        {(responsibility) => {
          const isCategoryLead = responsibility === "competition_category_lead";
          const scopes = isCategoryLead ? categories : competitions;
          return (
            <SelectField
              isRequired
              label={isCategoryLead ? "Competition Category" : "Competition"}
              name={isCategoryLead ? "competitionCategoryId" : "competitionId"}
              options={scopes
                .filter((scope) => scope.retiredAt === null)
                .map((scope) => ({ label: scope.name, value: scope.id }))}
              placeholder={
                isCategoryLead ? "Select a Category" : "Select a Competition"
              }
            />
          );
        }}
      </form.Subscribe>
      <CheckboxField
        className="rounded-none border p-3"
        description="The first responsibility is automatically used on the volunteer card."
        label="Use as primary card label"
        name="makePrimary"
      />
      <FormActions
        className="md:col-span-2"
        submitLabel="Assign Competition responsibility"
        submittingLabel="Assigning..."
      />
    </FormLayout>
  );
}
