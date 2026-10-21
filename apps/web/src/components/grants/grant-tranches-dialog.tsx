import { Delete02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import type { GrantTranche } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { DateField } from "@/components/form/date-field";
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
import { positiveRupeesSchema } from "@/lib/form-schemas";
import { epochToLocalDate, localDateToIso } from "@/lib/local-date";
import { handleMutationResult } from "@/lib/mutation-result";
import { paiseToRupeesInput } from "@/lib/paise";

import { GRANT_LAST_MONTH } from "./grant-dates";

const schema = z.object({
  tranches: z.array(
    z.object({
      amount: positiveRupeesSchema,
      expectedOn: z
        .date()
        .optional()
        .refine((value) => value !== undefined, "Pick the expected date"),
      id: z.string(),
      note: z.string().trim().max(200),
    })
  ),
});

type Values = z.input<typeof schema>;

const emptyTranche = (): Values["tranches"][number] => ({
  amount: "",
  expectedOn: undefined,
  id: uuidv7(),
  note: "",
});

function TranchesForm({
  grantId,
  onOpenChange,
  tranches,
}: {
  grantId: string;
  onOpenChange: (open: boolean) => void;
  tranches: readonly GrantTranche[];
}) {
  const zero = useZero();
  const form = useForm({
    defaultValues: {
      tranches:
        tranches.length > 0
          ? tranches.map((t) => ({
              amount: paiseToRupeesInput(t.amountPaise),
              expectedOn: epochToLocalDate(t.expectedOn),
              id: t.id,
              note: t.note ?? "",
            }))
          : [emptyTranche()],
    } as Values,
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.grant.saveTranches({
          grantId,
          tranches: value.tranches.map((t) => ({
            amountPaise: rupeesToPaise(t.amount.trim()),
            expectedOn: localDateToIso(t.expectedOn) ?? "",
            id: t.id,
            note: t.note.trim() || null,
          })),
        })
      ).server;
      handleMutationResult(res, {
        entityId: grantId,
        errorMsg: "Couldn't save the tranches",
        mutation: "grant.saveTranches",
        successMsg: "Tranches saved",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: schema, onSubmit: schema },
  });
  const add = useEventCallback(() =>
    form.pushFieldValue("tranches", emptyTranche())
  );
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <form.Subscribe selector={(state) => state.values.tranches}>
        {(rows) => (
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <li
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:grid-cols-[10rem_9rem_minmax(0,1fr)_auto]"
                data-testid="tranche-row"
                key={row.id}
              >
                <DateField
                  endMonth={GRANT_LAST_MONTH}
                  isRequired
                  label={`Tranche ${index + 1} expected on`}
                  name={`tranches[${index}].expectedOn`}
                />
                <InputField
                  inputMode="decimal"
                  isRequired
                  label={`Tranche ${index + 1} amount (₹)`}
                  name={`tranches[${index}].amount`}
                />
                <InputField
                  label={`Tranche ${index + 1} note`}
                  name={`tranches[${index}].note`}
                />
                <Button
                  aria-label={`Remove tranche ${index + 1}`}
                  className="mt-6"
                  onClick={() => form.removeFieldValue("tranches", index)}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    className="size-4"
                    icon={Delete02Icon}
                    strokeWidth={2}
                  />
                </Button>
              </li>
            ))}
          </ol>
        )}
      </form.Subscribe>
      <div>
        <Button onClick={add} size="sm" type="button" variant="outline">
          <HugeiconsIcon
            className="size-4"
            icon={PlusSignIcon}
            strokeWidth={2}
          />
          Add tranche
        </Button>
      </div>
      <FormActions
        onCancel={cancel}
        submitLabel="Save tranches"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * Edit tranches: the instalments the agreement expects. Money received is
 * the contributions linked to the grant; removing a tranche keeps its
 * contributions on the grant.
 */
export function GrantTranchesDialog({
  grantId,
  onOpenChange,
  open,
  tranches,
}: {
  grantId: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  tranches: readonly GrantTranche[];
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-lg)">
        <DialogHeader>
          <DialogTitle>Edit tranches</DialogTitle>
          <DialogDescription>
            When the grantor is expected to pay, and how much.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <TranchesForm
            grantId={grantId}
            onOpenChange={onOpenChange}
            tranches={tranches}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
