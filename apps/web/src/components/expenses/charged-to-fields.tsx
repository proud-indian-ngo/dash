import {
  ToggleGroup,
  ToggleGroupItem,
} from "@pi-dash/design-system/components/ui/toggle-group";
import {
  type ExpenseChargedTo,
  expenseChargedToValues,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";
import {
  CHARGED_TO_SPLIT_HINT,
  EXPENSE_CHARGED_TO_LABELS,
  ORGANISATION_CHARGE_HINT,
} from "@pi-dash/shared/expense-charge";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { type ReactNode, useEffect } from "react";

import { ComboboxField } from "@/components/form/combobox-field";
import { CustomField } from "@/components/form/custom-field";
import type { FormFieldApi } from "@/components/form/form-context";
import { useResolvedForm } from "@/components/form/form-context";
import type { SelectOption } from "@/components/form/select-field";
import { useApp } from "@/context/app-context";

const ITEM_CLASS =
  "h-auto min-h-8 flex-1 whitespace-normal py-2 aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground";

function isChargedTo(value: string | undefined): value is ExpenseChargedTo {
  return expenseChargedToValues.includes(value as ExpenseChargedTo);
}

/** The programme the request already holds, kept listed even if retired. */
export interface CurrentChargeProgramme {
  id: string;
  name: string;
}

/**
 * Programme and project pickers. New picks never offer the Unallocated
 * holder; a request already on it (or on a retired programme) keeps it
 * listed so it can be saved unchanged. Projects need finance.view to sync,
 * so people without it choose the programme only.
 */
function useChargeOptions(currentProgramme?: CurrentChargeProgramme | null) {
  const { hasPermission } = useApp();
  const [programmes] = useQuery(queries.programme.active());
  const [projects] = useQuery(queries.project.all(), {
    enabled: hasPermission("finance.view"),
  });
  const programmeOptions: SelectOption[] = programmes
    .filter((p) => p.id !== PROGRAMME_IDS.unallocated)
    .map((p) => ({ label: p.name, value: p.id }));
  if (
    currentProgramme &&
    !programmeOptions.some((o) => o.value === currentProgramme.id)
  ) {
    programmeOptions.push({
      label: currentProgramme.name,
      value: currentProgramme.id,
    });
  }
  return { programmeOptions, projects };
}

function ChargedToToggle({
  field,
}: {
  field: FormFieldApi<ExpenseChargedTo | undefined>;
}) {
  const handleChange = (next: string[]) => {
    const picked = next[0];
    if (isChargedTo(picked)) {
      field.handleChange(picked);
    }
  };
  return (
    <ToggleGroup
      aria-label="Charged to"
      className="w-full"
      id="charged-to"
      onValueChange={handleChange}
      value={field.state.value ? [field.state.value] : []}
      variant="outline"
    >
      {expenseChargedToValues.map((value) => (
        <ToggleGroupItem
          className={ITEM_CLASS}
          key={value}
          size="sm"
          value={value}
        >
          {value === "organisation" ? (
            // "(admin)" wraps the segment onto two lines on phones; the
            // hint under the toggle explains it there.
            <>
              Organisation<span className="max-sm:sr-only"> (admin)</span>
            </>
          ) : (
            EXPENSE_CHARGED_TO_LABELS[value]
          )}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Clears a project that does not sit under the chosen programme. */
function ProjectGuard({
  field,
  valid,
}: {
  field: FormFieldApi<string | undefined>;
  valid: boolean;
}) {
  const projectId = field.state.value;
  const { handleChange } = field;
  useEffect(() => {
    if (projectId && !valid) {
      handleChange(undefined);
    }
  }, [handleChange, projectId, valid]);
  return null;
}

function ProgrammeAndProject({
  currentProgramme,
  programmeId,
}: {
  currentProgramme?: CurrentChargeProgramme | null;
  programmeId: string | undefined;
}) {
  // Mounted only once "Programme" is chosen, so the other choices load no
  // programme or project rows.
  const { programmeOptions, projects } = useChargeOptions(currentProgramme);
  const form = useResolvedForm(undefined, "ProgrammeAndProject");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ComboboxField
        emptyMessage="No matching programmes."
        isRequired
        label="Programme"
        name="chargedProgrammeId"
        options={programmeOptions}
        placeholder="Search programmes"
      />
      <form.Field name="chargedProjectId">
        {(field: FormFieldApi<string | undefined>) => {
          const projectId = field.state.value;
          const projectOptions = projects
            .filter(
              (p) =>
                p.programmeId === programmeId &&
                (p.status !== "closed" || p.id === projectId)
            )
            .map((p) => ({ label: p.name, value: p.id }));
          // Without finance.view no project syncs; keep what finance chose.
          const valid =
            projects.length === 0 ||
            projectOptions.some((o) => o.value === projectId);
          return (
            <>
              <ProjectGuard field={field} valid={valid} />
              {projectOptions.length > 0 ? (
                <ComboboxField
                  emptyMessage="No matching projects."
                  label="Project"
                  name="chargedProjectId"
                  options={projectOptions}
                  placeholder="No project"
                />
              ) : null}
            </>
          );
        }}
      </form.Field>
    </div>
  );
}

interface ChargedToFieldsProps {
  currentProgramme?: CurrentChargeProgramme | null;
  /** The event picker, shown when the request is charged to an event. */
  eventField: ReactNode;
}

/**
 * "Charged to": which work the expense served, independent of the expense
 * category. One target per request.
 */
export function ChargedToFields({
  currentProgramme,
  eventField,
}: ChargedToFieldsProps) {
  const form = useResolvedForm(undefined, "ChargedToFields");

  return (
    <div className="flex flex-col gap-4">
      <CustomField<ExpenseChargedTo | undefined>
        controlId="charged-to"
        description={CHARGED_TO_SPLIT_HINT}
        isRequired
        label="Charged to"
        name="chargedTo"
      >
        {(field) => <ChargedToToggle field={field} />}
      </CustomField>
      <form.Field name="chargedTo">
        {(field: FormFieldApi<ExpenseChargedTo | undefined>) => {
          switch (field.state.value) {
            case "event":
              return eventField;
            case "organisation":
              return (
                <p className="text-muted-foreground text-sm">
                  {ORGANISATION_CHARGE_HINT}
                </p>
              );
            case "programme":
              return (
                <form.Field name="chargedProgrammeId">
                  {(programmeField: FormFieldApi<string | undefined>) => (
                    <ProgrammeAndProject
                      currentProgramme={currentProgramme}
                      programmeId={programmeField.state.value}
                    />
                  )}
                </form.Field>
              );
            default:
              return null;
          }
        }}
      </form.Field>
    </div>
  );
}
