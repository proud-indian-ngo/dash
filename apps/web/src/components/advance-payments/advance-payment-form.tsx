import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { BankAccount, ExpenseCategory } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { LineItemsEditor } from "@/components/form/line-items-editor";
import { SelectField } from "@/components/form/select-field";
import { useApp } from "@/context/app-context";
import { useStableQueryResult } from "@/hooks/use-stable-query-result";
import { cityOptions, newLineItem } from "@/lib/form-schemas";
import {
  type AdvancePaymentFormValues,
  advancePaymentFormSchema,
  DEFAULT_VALUES,
} from "./form/advance-payment-form.schema";

export interface AdvancePaymentFormProps {
  disableBankAccountSelection?: boolean;
  initialValues?: Partial<AdvancePaymentFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
}

export function AdvancePaymentForm({
  disableBankAccountSelection = false,
  initialValues,
  onCancel,
  onSaved,
}: AdvancePaymentFormProps) {
  const zero = useZero();
  const { openSettings } = useApp();
  const [categories, categoriesResult] = useQuery(
    queries.expenseCategory.all()
  );
  const [bankAccounts, bankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsByCurrentUser()
  );

  const existingId = initialValues?.id;

  const categoryList = useStableQueryResult(
    (categories ?? []) as ExpenseCategory[],
    categoriesResult
  );
  const bankAccountList = useStableQueryResult(
    (bankAccounts ?? []) as BankAccount[],
    bankAccountsResult
  );

  const bankAccountOptions = bankAccountList.map((account) => ({
    label: `${account.accountName} (••••${account.accountNumber.slice(-4)})`,
    value: account.id,
  }));

  const form = useForm({
    defaultValues: {
      ...DEFAULT_VALUES,
      ...initialValues,
      lineItems: initialValues?.lineItems ?? [newLineItem()],
      attachments: initialValues?.attachments ?? [],
    } as AdvancePaymentFormValues,
    onSubmit: ({ value }) => {
      const id = existingId ?? uuidv7();
      const lineItems = value.lineItems.map((item, index) => ({
        ...item,
        amount: Number(item.amount),
        sortOrder: index,
      }));
      const attachments = value.attachments;
      const selectedAccount = bankAccountList.find(
        (account) => account.accountName === value.bankAccountName
      );
      const bankAccountNumber =
        selectedAccount?.accountNumber ?? value.bankAccountNumber ?? "";
      const bankAccountIfscCode =
        selectedAccount?.ifscCode ?? value.bankAccountIfscCode ?? "";

      try {
        if (existingId) {
          zero.mutate(
            mutators.advancePayment.update({
              id: existingId,
              title: value.title,
              city: value.city,
              bankAccountName: value.bankAccountName,
              bankAccountNumber,
              bankAccountIfscCode,
              lineItems,
              attachments,
            })
          );
        } else {
          zero.mutate(
            mutators.advancePayment.create({
              id,
              title: value.title,
              city: value.city,
              bankAccountName: value.bankAccountName,
              bankAccountNumber,
              bankAccountIfscCode,
              lineItems,
              attachments,
            })
          );
        }

        toast.success("Advance payment submitted");
        onSaved(id);
      } catch (error) {
        toast.error("Failed to submit advance payment");
        console.error("Advance payment submit error:", error);
      }
    },
    validators: {
      onSubmit: advancePaymentFormSchema,
    },
  });

  return (
    <FormLayout className="flex flex-col gap-4" form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField isRequired label="Title" name="title" />
        <SelectField
          isRequired
          label="City"
          name="city"
          options={cityOptions}
          placeholder="Select city"
        />
        {bankAccountOptions.length > 0 ? (
          <CustomField<string | undefined>
            isRequired
            label="Bank Account"
            name="bankAccountName"
          >
            {(field) => {
              const selectedAccount = bankAccountList.find(
                (account) => account.accountName === field.state.value
              );

              return (
                <Select
                  disabled={disableBankAccountSelection}
                  onValueChange={(accountId) => {
                    const account = bankAccountList.find(
                      (entry) => entry.id === accountId
                    );

                    if (account) {
                      field.handleChange(account.accountName);
                      form.setFieldValue(
                        "bankAccountNumber",
                        account.accountNumber
                      );
                      form.setFieldValue(
                        "bankAccountIfscCode",
                        account.ifscCode
                      );
                    }
                  }}
                  value={selectedAccount?.id ?? ""}
                >
                  <SelectTrigger
                    aria-invalid={
                      field.state.meta.errors.length > 0 || undefined
                    }
                    className="w-full"
                  >
                    <span
                      className="flex flex-1 items-center text-left"
                      data-slot="select-value"
                    >
                      {bankAccountOptions.find(
                        (option) => option.value === (selectedAccount?.id ?? "")
                      )?.label ??
                        field.state.value ??
                        "Select bank account"}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccountOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              );
            }}
          </CustomField>
        ) : (
          <p className="text-muted-foreground text-sm">
            No bank account found. Add one in{" "}
            <button
              className="text-foreground underline underline-offset-2"
              onClick={() => openSettings("banking")}
              type="button"
            >
              Settings &rarr; Banking
            </button>{" "}
            to receive payments.
          </p>
        )}
      </div>

      <Separator />

      <LineItemsEditor categories={categoryList} />

      <Separator />

      <form.Field name="attachments">
        {(field) => (
          <AttachmentsSection
            onChange={(attachments) => field.handleChange(attachments)}
            value={field.state.value}
          />
        )}
      </form.Field>

      <Separator />

      <FormActions
        cancelLabel="Cancel"
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel="Submit"
        submittingLabel="Submitting..."
      />
    </FormLayout>
  );
}
