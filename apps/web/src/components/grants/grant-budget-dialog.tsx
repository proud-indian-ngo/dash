import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { formatPaise, rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import type { GrantBudgetLine } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";
import { isValidRupeesInput, paiseToRupeesInput } from "@/lib/paise";

interface Head {
  id: string;
  name: string;
}

const schema = z.object({
  amounts: z.record(
    z.string(),
    z
      .string()
      .refine(isValidRupeesInput, "Enter a rupee amount up to two decimals")
  ),
});

function totalOf(amounts: Record<string, string>): number {
  let total = 0;
  for (const value of Object.values(amounts)) {
    if (value.trim() && isValidRupeesInput(value)) {
      total += rupeesToPaise(value.trim());
    }
  }
  return total;
}

function BudgetForm({
  grantId,
  heads,
  lines,
  onOpenChange,
  sanctionedPaise,
}: {
  grantId: string;
  heads: readonly Head[];
  lines: readonly GrantBudgetLine[];
  onOpenChange: (open: boolean) => void;
  sanctionedPaise: number;
}) {
  const zero = useZero();
  const byHead = new Map(lines.map((l) => [l.accountHeadId, l]));
  const form = useForm({
    defaultValues: {
      amounts: Object.fromEntries(
        heads.map((h) => [
          h.id,
          paiseToRupeesInput(byHead.get(h.id)?.amountPaise),
        ])
      ),
    },
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.grant.saveBudget({
          grantId,
          lines: heads.flatMap((h) => {
            const amount = value.amounts[h.id]?.trim() ?? "";
            return amount
              ? [
                  {
                    accountHeadId: h.id,
                    amountPaise: rupeesToPaise(amount),
                    id: byHead.get(h.id)?.id ?? uuidv7(),
                  },
                ]
              : [];
          }),
        })
      ).server;
      handleMutationResult(res, {
        entityId: grantId,
        errorMsg: "Couldn't save the budget",
        mutation: "grant.saveBudget",
        successMsg: "Budget saved",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: schema, onSubmit: schema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <p className="text-muted-foreground text-sm">
        Leave a head blank for no budget.
      </p>
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
      <form.Subscribe selector={(state) => state.values.amounts}>
        {(amounts) => {
          const total = totalOf(amounts);
          return (
            <p className="text-sm" data-testid="grant-budget-total">
              <span className="text-muted-foreground">Total </span>
              <span className="font-mono tabular-nums">
                {formatPaise(total)}
              </span>
              <span className="text-muted-foreground">
                {" "}
                of {formatPaise(sanctionedPaise)} sanctioned
              </span>
            </p>
          );
        }}
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

/** Edit budget: the grant's amount for each expense head, as its agreement allocates it. */
export function GrantBudgetDialog({
  grantId,
  heads,
  lines,
  onOpenChange,
  open,
  sanctionedPaise,
}: {
  grantId: string;
  /** Budgetable heads, plus any the budget already holds. */
  heads: readonly Head[];
  lines: readonly GrantBudgetLine[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sanctionedPaise: number;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Edit budget</DialogTitle>
          <DialogDescription>
            The grant's budget for each expense head, compared with the
            project's spending in the books.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <BudgetForm
            grantId={grantId}
            heads={heads}
            lines={lines}
            onOpenChange={onOpenChange}
            sanctionedPaise={sanctionedPaise}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
