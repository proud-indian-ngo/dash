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
import { useMemo } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { LineItemsEditor } from "@/components/form/line-items-editor";
import { SelectField } from "@/components/form/select-field";
import { useApp } from "@/context/app-context";
import { useStableQueryResult } from "@/hooks/use-stable-query-result";
import { cityOptions, newLineItem } from "@/lib/form-schemas";
import {
  DEFAULT_VALUES,
  type ReimbursementFormValues,
  reimbursementFormSchema,
} from "./form/reimbursement-form.schema";

export interface ReimbursementFormProps {
  disableBankAccountSelection?: boolean;
  initialValues?: Partial<ReimbursementFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
}

export function ReimbursementForm({
  disableBankAccountSelection = false,
  initialValues,
  onCancel,
  onSaved,
}: ReimbursementFormProps) {
  const zero = useZero();
  const { openSettings } = useApp();
  const [categories, categoriesResult] = useQuery(
    queries.expenseCategory.all()
  );
  const [bankAccounts, bankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsByCurrentUser()
  );

  const existingId = initialValues?.id;
  const entityId = useMemo(() => existingId ?? uuidv7(), [existingId]);

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
    } as ReimbursementFormValues,
    onSubmit: async ({ value }) => {
      const id = entityId;
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

      const mutation = existingId
        ? zero.mutate(
            mutators.reimbursement.update({
              id: existingId,
              title: value.title,
              city: value.city,
              expenseDate: value.expenseDate,
              bankAccountName: value.bankAccountName,
              bankAccountNumber,
              bankAccountIfscCode,
              lineItems,
              attachments,
            })
          )
        : zero.mutate(
            mutators.reimbursement.create({
              id,
              title: value.title,
              city: value.city,
              expenseDate: value.expenseDate,
              bankAccountName: value.bankAccountName,
              bankAccountNumber,
              bankAccountIfscCode,
              lineItems,
              attachments,
            })
          );
      const res = await mutation.server;
      if (res.type === "error") {
        toast.error("Failed to submit reimbursement");
      } else {
        toast.success("Reimbursement submitted");
        onSaved(id);
      }
    },
    validators: {
      onSubmit: reimbursementFormSchema,
    },
  });

  return (
    <AppErrorBoundary level="section">
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
          <DateField
            isRequired
            label="Expense Date"
            maxDate={new Date()}
            name="expenseDate"
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
                      aria-describedby={
                        field.state.meta.errors.length > 0
                          ? `${field.name}-error`
                          : undefined
                      }
                      aria-invalid={
                        field.state.meta.errors.length > 0 || undefined
                      }
                      className="w-full"
                      id={field.name}
                      onBlur={field.handleBlur}
                    >
                      <span
                        className="flex flex-1 items-center text-left"
                        data-slot="select-value"
                      >
                        {bankAccountOptions.find(
                          (option) =>
                            option.value === (selectedAccount?.id ?? "")
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
              entityId={entityId}
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
    </AppErrorBoundary>
  );
}
