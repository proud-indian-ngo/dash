import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@pi-dash/design-system/components/ui/combobox";
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
import { useMemo, useState } from "react";
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
    competitionIds: z.array(z.string()),
    makePrimary: z.boolean(),
    responsibility: z.enum(KALAKRITI_EDITION_RESPONSIBILITIES),
    userIds: z.array(z.string()).min(1, "Select at least one volunteer"),
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
    if (scopeKind === "competition" && value.competitionIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Select a Competition",
        path: ["competitionIds"],
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

function CompetitionPicker({
  options,
  value,
  onValueChange,
  inputId,
}: {
  options: readonly ScopeOption[];
  value: string[];
  onValueChange: (ids: string[]) => void;
  inputId: string;
}) {
  const [search, setSearch] = useState("");
  const anchor = useComboboxAnchor();
  const filtered = options.filter(
    (option) =>
      option.retiredAt === null &&
      option.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  return (
    <Combobox
      multiple
      filter={null}
      inputValue={search}
      onInputValueChange={setSearch}
      value={value}
      onValueChange={onValueChange}
    >
      <ComboboxChips ref={anchor}>
        {value.map((id) => (
          <ComboboxChip key={id}>
            {options.find((option) => option.id === id)?.name ?? id}
          </ComboboxChip>
        ))}
        <ComboboxChipsInput id={inputId} placeholder="Search competitions..." />
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxList>
          {filtered.length === 0 && (
            <p className="text-muted-foreground p-2 text-sm">
              No matching competitions found.
            </p>
          )}
          {filtered.map((option) => (
            <ComboboxItem key={option.id} value={option.id}>
              {option.name}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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
      competitionIds: [] as string[],
      makePrimary: false,
      responsibility: defaultResponsibility,
      userIds: initialUserId ? [initialUserId] : ([] as string[]),
    },
    onSubmit: async ({ value }) => {
      if (!assignableResponsibilities.includes(value.responsibility)) return;
      const competitionIds =
        getKalakritiResponsibilityScopeKind(value.responsibility) ===
        "competition"
          ? value.competitionIds
          : [""];
      for (const userId of value.userIds) {
        for (const [index, competitionId] of competitionIds.entries()) {
          const assignmentId = uuidv7();
          const result = await assignKalakritiRole(zero, {
            centerId: value.centerId,
            competitionCategoryId: value.competitionCategoryId,
            competitionId,
            responsibility: value.responsibility,
            common: {
              assignmentId,
              auditEntryId: uuidv7(),
              editionId,
              makePrimary: value.makePrimary && index === 0,
              membershipId: uuidv7(),
              now: currentTimestamp(),
              teamEventMemberId: uuidv7(),
              userId,
            },
          });
          handleMutationResult(result, {
            entityId: assignmentId,
            errorMsg:
              "Failed to assign role. Earlier assignments may have succeeded.",
            mutation: "kalakritiAssignment.assignRole",
          });
          if (result.type === "error") return;
        }
      }
      onAssigned?.();
      form.reset();
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
      <CustomField<string[]> isRequired label="Volunteers" name="userIds">
        {(field) => (
          <UserPicker
            inputId={field.name}
            onValueChange={field.handleChange}
            users={users}
            value={field.state.value ?? []}
            placeholder="Search volunteers..."
          />
        )}
      </CustomField>
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
              <CustomField<string[]>
                isRequired
                label="Competitions"
                name="competitionIds"
              >
                {(field) => (
                  <CompetitionPicker
                    inputId={field.name}
                    options={competitions}
                    value={field.state.value ?? []}
                    onValueChange={field.handleChange}
                  />
                )}
              </CustomField>
            );
          }

          return null;
        }}
      </form.Subscribe>
      <CheckboxField
        className="rounded-none border p-3 md:col-span-2"
        description="Show this role first on each selected volunteer’s card. For multiple competitions, the first selected competition is primary."
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
