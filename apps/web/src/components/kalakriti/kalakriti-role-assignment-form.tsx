import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  buildKalakritiAssignableResponsibilityGroups,
  flattenKalakritiAssignableResponsibilities,
  getKalakritiResponsibilityScopeKind,
  KALAKRITI_EDITION_RESPONSIBILITIES,
  KALAKRITI_RESPONSIBILITY_LABELS,
  type KalakritiCenterVolunteerResponsibility,
  type KalakritiCompetitionScopedResponsibility,
  type KalakritiResponsibility,
  type KalakritiResponsibilityGroup,
  type KalakritiVolunteerEditionAssignmentResponsibility,
} from "@pi-dash/shared/kalakriti";
import { mutators } from "@pi-dash/zero/mutators";
import type { Zero } from "@rocicorp/zero";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useCallback, useMemo } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import {
  type FormFieldApi,
  fieldErrorProps,
  useResolvedForm,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { UserPicker } from "@/components/shared/user-picker";
import type { PickerUser } from "@/functions/users-for-picker";
import { handleMutationResult } from "@/lib/mutation-result";

interface ScopeOption {
  id: string;
  name: string;
  retiredAt?: number | null;
}

const roleAssignmentSchema = z
  .object({
    centerId: z.string(),
    competitionCategoryId: z.string(),
    competitionId: z.string(),
    makePrimary: z.boolean(),
    responsibility: z.enum(KALAKRITI_EDITION_RESPONSIBILITIES),
    userIds: z.array(z.string()).length(1, "Select one volunteer"),
  })
  .superRefine((value, context) => {
    const { responsibility } = value;
    const scopeKind = getKalakritiResponsibilityScopeKind(responsibility);

    if (scopeKind === "center" && !value.centerId) {
      context.addIssue({
        code: "custom",
        message: "Select a Center",
        path: ["centerId"],
      });
    }
    if (scopeKind === "competition_category" && !value.competitionCategoryId) {
      context.addIssue({
        code: "custom",
        message: "Select a Competition Category",
        path: ["competitionCategoryId"],
      });
    }
    if (scopeKind === "competition" && !value.competitionId) {
      context.addIssue({
        code: "custom",
        message: "Select a Competition",
        path: ["competitionId"],
      });
    }
  });

function currentTimestamp(): number {
  return Date.now();
}

function assignKalakritiRole(
  zero: Zero,
  input: {
    centerId: string;
    common: {
      assignmentId: string;
      auditEntryId: string;
      editionId: string;
      makePrimary: boolean;
      membershipId: string;
      now: number;
      teamEventMemberId: string;
      userId: string;
    };
    competitionCategoryId: string;
    competitionId: string;
    responsibility: KalakritiResponsibility;
  }
) {
  const {
    centerId,
    common,
    competitionCategoryId,
    competitionId,
    responsibility,
  } = input;
  const scopeKind = getKalakritiResponsibilityScopeKind(responsibility);

  if (scopeKind === "center") {
    return zero.mutate(
      mutators.kalakritiAssignment.assignLiaison({
        ...common,
        centerId,
        responsibility:
          responsibility as KalakritiCenterVolunteerResponsibility,
      })
    ).server;
  }

  if (scopeKind === "competition_category") {
    return zero.mutate(
      mutators.kalakritiAssignment.assignCompetitionCategoryLead({
        ...common,
        competitionCategoryId,
        responsibility: "competition_category_lead",
      })
    ).server;
  }

  if (scopeKind === "competition") {
    return zero.mutate(
      mutators.kalakritiAssignment.assignCompetitionMember({
        ...common,
        competitionId,
        responsibility:
          responsibility as KalakritiCompetitionScopedResponsibility,
      })
    ).server;
  }

  return zero.mutate(
    mutators.kalakritiAssignment.assignVolunteer({
      ...common,
      responsibility:
        responsibility as KalakritiVolunteerEditionAssignmentResponsibility,
    })
  ).server;
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

function ResponsibilitySelectControl({
  field,
  groups,
  submitted,
}: {
  field: FormFieldApi<string | undefined>;
  groups: readonly KalakritiResponsibilityGroup[];
  submitted: boolean;
}) {
  const selectedValue = field.state.value as string | undefined;
  const selectedLabel =
    selectedValue &&
    KALAKRITI_RESPONSIBILITY_LABELS[selectedValue as KalakritiResponsibility];
  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      field.handleBlur();
    }
  });

  return (
    <Select
      onOpenChange={handleOpenChange}
      onValueChange={field.handleChange}
      value={selectedValue ?? ""}
    >
      <SelectTrigger
        {...fieldErrorProps(field, submitted)}
        aria-required
        id={field.name}
      >
        <span className="truncate">{selectedLabel ?? "Select a role"}</span>
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.responsibilities.map((responsibility) => (
              <SelectItem key={responsibility} value={responsibility}>
                {KALAKRITI_RESPONSIBILITY_LABELS[responsibility]}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

function ResponsibilitySelectField({
  groups,
  name,
}: {
  groups: readonly KalakritiResponsibilityGroup[];
  name: string;
}) {
  const form = useResolvedForm(undefined, "ResponsibilitySelectField");
  const submitted = form.state.submissionAttempts > 0;

  return (
    <CustomField
      description="Edition, operational, competition, and Center roles are grouped here."
      isRequired
      label="Role"
      name={name}
    >
      {(field) => (
        <ResponsibilitySelectControl
          field={field as FormFieldApi<string | undefined>}
          groups={groups}
          submitted={submitted}
        />
      )}
    </CustomField>
  );
}

export function KalakritiRoleAssignmentForm({
  actorResponsibilities,
  categories,
  centers,
  competitions,
  editionId,
  initialUserId,
  isGlobalAdmin,
  lockedVolunteerName,
  onAssigned,
  onCancel,
  users,
}: {
  actorResponsibilities: readonly KalakritiResponsibility[];
  categories: readonly ScopeOption[];
  centers: readonly ScopeOption[];
  competitions: readonly ScopeOption[];
  editionId: string;
  initialUserId?: string | null;
  isGlobalAdmin: boolean;
  lockedVolunteerName?: string | null;
  onAssigned?: () => void;
  onCancel?: () => void;
  users: readonly PickerUser[];
}) {
  const zero = useZero();
  const responsibilityGroups = useMemo(
    () =>
      buildKalakritiAssignableResponsibilityGroups({
        actorResponsibilities,
        isGlobalAdmin,
      }),
    [actorResponsibilities, isGlobalAdmin]
  );
  const assignableResponsibilities = useMemo(
    () => flattenKalakritiAssignableResponsibilities(responsibilityGroups),
    [responsibilityGroups]
  );
  const defaultResponsibility =
    assignableResponsibilities[0] ?? ("overall_events_lead" as const);
  const selectResponsibility = useEventCallback(
    (state: { values: { responsibility: string } }) =>
      state.values.responsibility
  );
  const form = useForm({
    defaultValues: {
      centerId: "",
      competitionCategoryId: "",
      competitionId: "",
      makePrimary: false,
      responsibility: defaultResponsibility,
      userIds: initialUserId ? [initialUserId] : ([] as string[]),
    },
    onSubmit: async ({ value }) => {
      const [userId] = value.userIds;
      if (!userId) {
        return;
      }
      if (!assignableResponsibilities.includes(value.responsibility)) {
        return;
      }

      const {
        makePrimary,
        responsibility,
        centerId,
        competitionCategoryId,
        competitionId,
      } = value;
      const assignmentId = uuidv7();
      const common = {
        assignmentId,
        auditEntryId: uuidv7(),
        editionId,
        makePrimary,
        membershipId: uuidv7(),
        now: currentTimestamp(),
        teamEventMemberId: uuidv7(),
        userId,
      };

      const result = await assignKalakritiRole(zero, {
        centerId,
        common,
        competitionCategoryId,
        competitionId,
        responsibility,
      });

      handleMutationResult(result, {
        entityId: assignmentId,
        errorMsg: "Failed to assign role",
        mutation: "kalakritiAssignment.assignRole",
        successMsg: "Role assigned",
      });
      if (result.type !== "error") {
        onAssigned?.();
        form.reset();
      }
    },
    validators: {
      onChange: roleAssignmentSchema,
      onSubmit: roleAssignmentSchema,
    },
  });

  if (assignableResponsibilities.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        You do not have permission to assign any roles.
      </p>
    );
  }

  return (
    <FormLayout className="grid gap-4 md:grid-cols-2" form={form}>
      {initialUserId ? (
        <div className="grid gap-1">
          <p className="text-sm font-medium">Volunteer</p>
          <p className="text-sm">
            {lockedVolunteerName ??
              users.find((candidate) => candidate.id === initialUserId)?.name ??
              "Selected volunteer"}
          </p>
        </div>
      ) : (
        <CustomField<string[]> isRequired label="Volunteer" name="userIds">
          {(field) => (
            <SingleVolunteerPicker
              onValueChange={field.handleChange}
              users={users}
              value={field.state.value ?? []}
            />
          )}
        </CustomField>
      )}
      <ResponsibilitySelectField
        groups={responsibilityGroups}
        name="responsibility"
      />
      <form.Subscribe selector={selectResponsibility}>
        {(responsibility) => {
          const scopeKind = getKalakritiResponsibilityScopeKind(
            responsibility as KalakritiResponsibility
          );

          if (scopeKind === "center") {
            return (
              <SelectField
                isRequired
                label="Center"
                name="centerId"
                options={centers
                  .filter((center) => center.retiredAt === null)
                  .map((center) => ({ label: center.name, value: center.id }))}
                placeholder="Select a Center"
              />
            );
          }

          if (scopeKind === "competition_category") {
            return (
              <SelectField
                isRequired
                label="Competition Category"
                name="competitionCategoryId"
                options={categories
                  .filter((category) => category.retiredAt === null)
                  .map((category) => ({
                    label: category.name,
                    value: category.id,
                  }))}
                placeholder="Select a Category"
              />
            );
          }

          if (scopeKind === "competition") {
            return (
              <SelectField
                isRequired
                label="Competition"
                name="competitionId"
                options={competitions
                  .filter((competition) => competition.retiredAt === null)
                  .map((competition) => ({
                    label: competition.name,
                    value: competition.id,
                  }))}
                placeholder="Select a Competition"
              />
            );
          }

          return null;
        }}
      </form.Subscribe>
      <CheckboxField
        className="rounded-none border p-3 md:col-span-2"
        description="When this volunteer has multiple roles, this one appears first on their card."
        label="Show as primary card label"
        name="makePrimary"
      />
      <FormActions
        className="md:col-span-2"
        onCancel={onCancel}
        submitLabel="Assign role"
        submittingLabel="Assigning..."
      />
    </FormLayout>
  );
}
