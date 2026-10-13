import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  GENERAL_FUND_ID,
  type OtherIncomeKind,
  otherIncomeKindValues,
} from "@pi-dash/shared/constants";
import { OTHER_INCOME_KIND_LABELS } from "@pi-dash/shared/income";
import { rupeesToPaise } from "@pi-dash/shared/money";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { ComboboxField } from "@/components/form/combobox-field";
import { DateField } from "@/components/form/date-field";
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
import { positiveRupeesSchema } from "@/lib/form-schemas";
import { epochToLocalDate, localDateToIso } from "@/lib/local-date";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { paiseToRupeesInput } from "@/lib/paise";

import type { OtherIncomeRow } from "./income-types";

const kindOptions = otherIncomeKindValues.map((value) => ({
  label: OTHER_INCOME_KIND_LABELS[value],
  value,
}));

/** A required picker: empty until chosen, so the input type allows undefined. */
const pick = (message: string) =>
  z
    .string()
    .optional()
    .refine((value) => Boolean(value), message);
const requiredDate = (message: string) =>
  z
    .date()
    .optional()
    .refine((value) => value !== undefined, message);

const formSchema = z.object({
  amount: positiveRupeesSchema,
  description: z.string().trim().max(500),
  fundId: pick("Pick a fund"),
  kind: z.enum(otherIncomeKindValues),
  orgAccountId: pick("Pick the account it was deposited into"),
  receivedOn: requiredDate("Pick the date it was received"),
});

type FormValues = z.input<typeof formSchema>;

function OtherIncomeForm({
  income,
  onOpenChange,
}: {
  income: OtherIncomeRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const zero = useZero();
  const isEdit = income !== null;
  const [id] = useState(() => income?.id ?? uuidv7());
  const [accounts] = useQuery(queries.orgAccount.active());
  const [funds] = useQuery(queries.fund.active());
  const defaultFundId =
    funds.find((f) => f.id === GENERAL_FUND_ID)?.id ?? funds[0]?.id;

  const defaultValues: FormValues = income
    ? {
        amount: paiseToRupeesInput(income.amountPaise),
        description: income.description ?? "",
        fundId: income.fundId,
        kind: income.kind as OtherIncomeKind,
        orgAccountId: income.orgAccountId,
        receivedOn: epochToLocalDate(income.receivedOn),
      }
    : {
        amount: "",
        description: "",
        fundId: defaultFundId,
        kind: "interest",
        orgAccountId: undefined,
        receivedOn: new Date(),
      };

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value }) => {
      const args = {
        amountPaise: rupeesToPaise(value.amount),
        description: value.description || null,
        fundId: value.fundId ?? "",
        id,
        kind: value.kind,
        orgAccountId: value.orgAccountId ?? "",
        receivedOn: localDateToIso(value.receivedOn) ?? "",
      };
      const res = await zero.mutate(
        isEdit
          ? mutators.otherIncome.update(args)
          : mutators.otherIncome.create(args)
      ).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't save income",
        mutation: isEdit ? "otherIncome.update" : "otherIncome.create",
        showErrorToast: false,
        successMsg: isEdit ? "Income updated" : "Income recorded",
      });
      if (res.type === "error") {
        toast.error("Couldn't save income", {
          description: getMutationResultErrorMessage(
            res.error,
            "Something went wrong"
          ),
        });
        return;
      }
      onOpenChange(false);
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Kind"
          name="kind"
          options={kindOptions}
        />
        <DateField
          isRequired
          label="Received on"
          maxDate={new Date()}
          name="receivedOn"
        />
        <InputField isRequired label="Amount (₹)" name="amount" />
        <ComboboxField
          emptyMessage="No active accounts."
          isRequired
          label="Deposited into"
          name="orgAccountId"
          options={accounts.map((a) => ({ label: a.name, value: a.id }))}
          placeholder="Search accounts..."
        />
        {funds.length > 1 ? (
          <SelectField
            isRequired
            label="Fund"
            name="fundId"
            options={funds.map((f) => ({ label: f.name, value: f.id }))}
          />
        ) : null}
      </div>
      <TextareaField label="Description" name="description" rows={2} />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={isEdit ? "Save changes" : "Record income"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function OtherIncomeFormDialog({
  income,
  onOpenChange,
  open,
}: {
  income: OtherIncomeRow | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>
            {income ? "Edit other income" : "Record other income"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Income that is not a donation, such as bank interest
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <OtherIncomeForm
            income={income}
            key={income?.id ?? "new"}
            onOpenChange={onOpenChange}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
