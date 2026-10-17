import { Copy01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { BudgetInput } from "@pi-dash/shared/budgets";
import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { formatPaise, rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { type ReactNode, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";
import { isValidRupeesInput, paiseToRupeesInput } from "@/lib/paise";

/** A budget as Zero syncs it, with its line IDs. */
export interface StoredBudget extends BudgetInput {
  fiscalYearId: string;
  lines: { accountHeadId: string; amountPaise: number; id: string }[];
}

export interface BudgetScopeChoice {
  programmeId: string;
  projectId: string | null;
}

/** What the dialog opens on: a fixed scope, or a picker (optionally on a programme). */
export type BudgetDialogTarget =
  | { kind: "scope"; scope: BudgetScopeChoice }
  | { kind: "pick"; programmeId: string | null };

interface Named {
  id: string;
  name: string;
}

export interface BudgetFormOptions {
  /** Expense heads that can carry a budget, in the books' order. */
  heads: (Named & { active: boolean })[];
  programmes: (Named & { active: boolean })[];
  projects: (Named & { programmeId: string; status: string })[];
}

const NO_PROJECT = "none";
const WHOLE_PROGRAMME = "Whole programme";

const amountsSchema = z.object({
  amounts: z.record(
    z.string(),
    z
      .string()
      .refine(isValidRupeesInput, "Enter a rupee amount up to two decimals")
  ),
  note: z.string().trim().max(500),
});

const findBudget = (
  budgets: readonly StoredBudget[],
  fiscalYearId: string | undefined,
  scope: BudgetScopeChoice
) =>
  budgets.find(
    (b) =>
      b.fiscalYearId === fiscalYearId &&
      b.programmeId === scope.programmeId &&
      b.projectId === scope.projectId
  );

function amountsOf(
  heads: readonly Named[],
  budget: StoredBudget | undefined
): Record<string, string> {
  const amounts = new Map(
    (budget?.lines ?? []).map((l) => [l.accountHeadId, l.amountPaise])
  );
  return Object.fromEntries(
    heads.map((h) => [h.id, paiseToRupeesInput(amounts.get(h.id))])
  );
}

function totalOf(amounts: Record<string, string>): number {
  let total = 0;
  for (const value of Object.values(amounts)) {
    if (value.trim() && isValidRupeesInput(value)) {
      total += rupeesToPaise(value.trim());
    }
  }
  return total;
}

function BudgetAmountsForm({
  budget,
  heads,
  onOpenChange,
  previous,
  previousLabel,
  scope,
  yearId,
}: {
  budget: StoredBudget | undefined;
  heads: readonly Named[];
  onOpenChange: (open: boolean) => void;
  previous: StoredBudget | undefined;
  previousLabel: string | null;
  scope: BudgetScopeChoice;
  yearId: string;
}) {
  const zero = useZero();
  const [id] = useState(() => budget?.id ?? uuidv7());
  const form = useForm({
    defaultValues: {
      amounts: amountsOf(heads, budget),
      note: budget?.note ?? "",
    },
    onSubmit: async ({ value }) => {
      const lineIds = new Map(
        (budget?.lines ?? []).map((l) => [l.accountHeadId, l.id])
      );
      const lines = heads.flatMap((h) => {
        const amount = value.amounts[h.id]?.trim() ?? "";
        return amount
          ? [
              {
                accountHeadId: h.id,
                amountPaise: rupeesToPaise(amount),
                id: lineIds.get(h.id) ?? uuidv7(),
              },
            ]
          : [];
      });
      const res = await zero.mutate(
        mutators.budget.save({
          fiscalYearId: yearId,
          id,
          lines,
          note: value.note.trim() || null,
          programmeId: scope.programmeId,
          projectId: scope.projectId,
        })
      ).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't save the budget",
        mutation: "budget.save",
        successMsg: lines.length > 0 ? "Budget saved" : "Budget removed",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: amountsSchema, onSubmit: amountsSchema },
  });
  const copyPrevious = useEventCallback(() => {
    const amounts = amountsOf(heads, previous);
    for (const head of heads) {
      form.setFieldValue(`amounts.${head.id}`, amounts[head.id] ?? "");
    }
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          Leave a head blank for no budget.
        </p>
        {previous && previousLabel ? (
          <Button
            onClick={copyPrevious}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              className="size-4"
              icon={Copy01Icon}
              strokeWidth={2}
            />
            Copy FY {previousLabel}
          </Button>
        ) : null}
      </div>
      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {heads.map((head) => (
          <InputField
            inputMode="decimal"
            key={head.id}
            label={`${head.name} (₹)`}
            name={`amounts.${head.id}`}
            placeholder="No budget"
          />
        ))}
      </div>
      <TextareaField label="Note" name="note" rows={2} />
      <form.Subscribe selector={(state) => state.values.amounts}>
        {(amounts) => (
          <p className="text-sm" data-testid="budget-form-total">
            <span className="text-muted-foreground">Total </span>
            <span className="font-mono tabular-nums">
              {formatPaise(totalOf(amounts))}
            </span>
          </p>
        )}
      </form.Subscribe>
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel="Save budget"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * Picks the programme and project when the dialog opens without one, and
 * renders the amounts for the picked scope. A project of another programme
 * left in the project picker counts as the whole programme.
 */
function ScopePicker({
  children,
  options,
  programmeId: initialProgrammeId,
}: {
  children: (scope: BudgetScopeChoice | null) => ReactNode;
  options: BudgetFormOptions;
  programmeId: string | null;
}) {
  const form = useForm({
    defaultValues: {
      programmeId: initialProgrammeId ?? undefined,
      projectId: NO_PROJECT,
    },
  });
  const programmeOptions = options.programmes
    .filter((p) => p.active && p.id !== PROGRAMME_IDS.unallocated)
    .map((p) => ({ label: p.name, value: p.id }));

  return (
    <form.Subscribe selector={(state) => state.values}>
      {({ programmeId, projectId }) => {
        const project = options.projects.find(
          (p) => p.id === projectId && p.programmeId === programmeId
        );
        return (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                form={form}
                isRequired
                label="Programme"
                name="programmeId"
                options={programmeOptions}
                placeholder="Pick a programme"
              />
              <SelectField
                disabled={!programmeId}
                form={form}
                label="Project"
                name="projectId"
                options={[
                  { label: WHOLE_PROGRAMME, value: NO_PROJECT },
                  ...options.projects
                    .filter(
                      (p) =>
                        p.programmeId === programmeId && p.status !== "closed"
                    )
                    .map((p) => ({ label: p.name, value: p.id })),
                ]}
                placeholder={WHOLE_PROGRAMME}
              />
            </div>
            {children(
              programmeId
                ? { programmeId, projectId: project?.id ?? null }
                : null
            )}
          </>
        );
      }}
    </form.Subscribe>
  );
}

/**
 * Set budget / Edit budget: one programme's (or project's) budget for a
 * year, one amount per expense head. Opened from a row, the scope is
 * fixed; from the page header, it is picked first.
 */
export function BudgetFormDialog({
  budgets,
  onOpenChange,
  options,
  previousYear,
  target,
  year,
}: {
  budgets: readonly StoredBudget[];
  onOpenChange: (open: boolean) => void;
  options: BudgetFormOptions;
  previousYear: { id: string; label: string } | null;
  target: BudgetDialogTarget | null;
  year: { id: string; label: string };
}) {
  const fixedScope = target?.kind === "scope" ? target.scope : null;
  const amountsFor = (scope: BudgetScopeChoice) => {
    const budget = findBudget(budgets, year.id, scope);
    // Heads in use by this budget stay listed even once inactive.
    const used = new Set(budget?.lines.map((l) => l.accountHeadId));
    return (
      <BudgetAmountsForm
        budget={budget}
        heads={options.heads.filter((h) => h.active || used.has(h.id))}
        key={`${scope.programmeId}:${scope.projectId ?? ""}`}
        onOpenChange={onOpenChange}
        previous={findBudget(budgets, previousYear?.id, scope)}
        previousLabel={previousYear?.label ?? null}
        scope={scope}
        yearId={year.id}
      />
    );
  };
  const fixed = fixedScope ? findBudget(budgets, year.id, fixedScope) : null;
  const programmeName = options.programmes.find(
    (p) => p.id === fixedScope?.programmeId
  )?.name;
  const projectName = options.projects.find(
    (p) => p.id === fixedScope?.projectId
  )?.name;
  const scopeName = projectName
    ? `${projectName} (${programmeName ?? "programme"})`
    : programmeName;

  return (
    <Dialog onOpenChange={onOpenChange} open={target !== null}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>
            {fixed ? "Edit budget" : "Set budget"} · FY {year.label}
          </DialogTitle>
          <DialogDescription>
            {scopeName
              ? `${scopeName}: the year's budget for each expense head.`
              : "Pick a programme, or one of its projects, then set the year's budget for each expense head."}
          </DialogDescription>
        </DialogHeader>
        {fixedScope ? amountsFor(fixedScope) : null}
        {target?.kind === "pick" ? (
          <ScopePicker options={options} programmeId={target.programmeId}>
            {(scope) => (scope ? amountsFor(scope) : null)}
          </ScopePicker>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
