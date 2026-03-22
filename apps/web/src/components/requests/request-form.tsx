import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type {
  BankAccount,
  ExpenseCategory,
  Vendor,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useMemo, useState } from "react";
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
import { handleMutationResult } from "@/lib/mutation-result";
import type { RequestType } from "@/lib/request-types";
import { REQUEST_TYPE_LABELS } from "@/lib/request-types";
import {
  getDefaultValues,
  getFormSchema,
  type RequestFormValues,
} from "./form/request-form.schema";

export interface RequestFormProps {
  disableBankAccountSelection?: boolean;
  disableTypeSelection?: boolean;
  initialValues?: Partial<RequestFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
  requestType: RequestType;
}

export function RequestForm({
  disableBankAccountSelection = false,
  disableTypeSelection = false,
  initialValues,
  onCancel,
  onSaved,
  requestType,
}: RequestFormProps) {
  const [currentType, setCurrentType] = useState<RequestType>(requestType);

  return (
    <AppErrorBoundary level="section">
      {disableTypeSelection ? null : (
        <>
          <TypeSelector onChange={setCurrentType} value={currentType} />
          <Separator className="my-4" />
        </>
      )}
      <RequestFormInner
        disableBankAccountSelection={disableBankAccountSelection}
        initialValues={initialValues}
        key={currentType}
        onCancel={onCancel}
        onSaved={onSaved}
        requestType={currentType}
      />
    </AppErrorBoundary>
  );
}

function TypeSelector({
  value,
  onChange,
}: {
  onChange: (type: RequestType) => void;
  value: RequestType;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-medium text-sm" htmlFor="request-type">
        Type <span className="text-destructive">*</span>
      </label>
      <Select
        onValueChange={(val) => {
          if (
            val === "reimbursement" ||
            val === "advance_payment" ||
            val === "vendor_payment"
          ) {
            onChange(val);
          }
        }}
        value={value}
      >
        <SelectTrigger className="w-full" id="request-type">
          <span
            className="flex flex-1 items-center text-left"
            data-slot="select-value"
          >
            {REQUEST_TYPE_LABELS[value] ?? "Select type"}
          </span>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="reimbursement">Reimbursement</SelectItem>
          <SelectItem value="advance_payment">Advance Payment</SelectItem>
          <SelectItem value="vendor_payment">Vendor Payment</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function buildMutation(
  zero: ReturnType<typeof useZero>,
  value: RequestFormValues,
  entityId: string,
  existingId: string | undefined,
  bankAccountList: BankAccount[]
) {
  const lineItems = value.lineItems.map((item, index) => ({
    ...item,
    amount: Number(item.amount),
    sortOrder: index,
  }));
  const attachments = value.attachments;
  const id = existingId ?? entityId;

  if (value.type === "vendor_payment") {
    const payload = {
      id,
      vendorId: value.vendorId,
      title: value.title,
      invoiceNumber: value.invoiceNumber,
      invoiceDate: value.invoiceDate,
      lineItems,
      attachments,
    };
    return existingId
      ? zero.mutate(mutators.vendorPayment.update(payload))
      : zero.mutate(mutators.vendorPayment.create(payload));
  }

  const selectedAccount = bankAccountList.find(
    (account) => account.accountName === value.bankAccountName
  );
  const basePayload = {
    id,
    title: value.title,
    city: value.city,
    bankAccountName: value.bankAccountName,
    bankAccountNumber:
      selectedAccount?.accountNumber ?? value.bankAccountNumber ?? "",
    bankAccountIfscCode:
      selectedAccount?.ifscCode ?? value.bankAccountIfscCode ?? "",
    lineItems,
    attachments,
  };

  if (value.type === "reimbursement") {
    const reimbPayload = { ...basePayload, expenseDate: value.expenseDate };
    return existingId
      ? zero.mutate(mutators.reimbursement.update(reimbPayload))
      : zero.mutate(mutators.reimbursement.create(reimbPayload));
  }

  return existingId
    ? zero.mutate(mutators.advancePayment.update(basePayload))
    : zero.mutate(mutators.advancePayment.create(basePayload));
}

interface RequestFormInnerProps {
  disableBankAccountSelection: boolean;
  initialValues?: Partial<RequestFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
  requestType: RequestType;
}

function RequestFormInner({
  disableBankAccountSelection,
  initialValues,
  onCancel,
  onSaved,
  requestType,
}: RequestFormInnerProps) {
  const zero = useZero();
  const { openSettings } = useApp();
  const [categories, categoriesResult] = useQuery(
    queries.expenseCategory.all()
  );
  const [bankAccounts, bankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsByCurrentUser()
  );
  const [vendors, vendorsResult] = useQuery(queries.vendor.all());

  const existingId = initialValues?.id;
  const isEdit = !!existingId;
  const entityId = useMemo(() => existingId ?? uuidv7(), [existingId]);

  const categoryList = useStableQueryResult(
    (categories ?? []) as ExpenseCategory[],
    categoriesResult
  );
  const bankAccountList = useStableQueryResult(
    (bankAccounts ?? []) as BankAccount[],
    bankAccountsResult
  );
  const vendorList = useStableQueryResult(
    (vendors ?? []) as Vendor[],
    vendorsResult
  );

  const bankAccountOptions = bankAccountList.map((account) => ({
    label: `${account.accountName} (••••${account.accountNumber.slice(-4)})`,
    value: account.id,
  }));

  const vendorOptions = vendorList.map((v) => ({
    label: v.name,
    value: v.id,
  }));

  const isVendorPayment = requestType === "vendor_payment";

  const strippedInitialValues = useMemo(() => {
    if (!initialValues || requestType === "reimbursement") {
      return initialValues;
    }
    const { expenseDate: _, ...rest } =
      initialValues as Partial<RequestFormValues> & {
        id?: string;
        expenseDate?: string;
      };
    return rest;
  }, [initialValues, requestType]);

  const form = useForm({
    defaultValues: {
      ...getDefaultValues(requestType),
      ...strippedInitialValues,
      type: requestType,
      lineItems: initialValues?.lineItems ?? [newLineItem()],
      attachments: initialValues?.attachments ?? [],
    },
    onSubmit: async ({ value: rawValue }) => {
      const value = rawValue as RequestFormValues;
      const id = entityId;
      const typeLabel = REQUEST_TYPE_LABELS[value.type];
      const mutation = buildMutation(
        zero,
        value,
        id,
        existingId,
        bankAccountList
      );

      const mutatorNameMap = {
        vendor_payment: "vendorPayment",
        reimbursement: "reimbursement",
        advance_payment: "advancePayment",
      } as const;
      const mutatorName = mutatorNameMap[value.type];

      const res = await mutation.server;
      handleMutationResult(res, {
        mutation: `${mutatorName}.${existingId ? "update" : "create"}`,
        entityId: id,
        successMsg: `${typeLabel} submitted`,
        errorMsg: `Failed to submit ${typeLabel.toLowerCase()}`,
      });
      if (res.type !== "error") {
        onSaved(id);
      }
    },
    validators: {
      onSubmit: getFormSchema(requestType),
    },
  });

  if (isVendorPayment) {
    return (
      <FormLayout className="flex flex-col gap-4" form={form}>
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField isRequired label="Title" name="title" />
          <CustomField<string | undefined>
            isRequired
            label="Vendor"
            name="vendorId"
          >
            {(field) => (
              <Select
                onValueChange={(val) => field.handleChange(val)}
                value={field.state.value ?? ""}
              >
                <SelectTrigger
                  aria-describedby={
                    field.state.meta.errors.length > 0
                      ? `${field.name}-error`
                      : undefined
                  }
                  aria-invalid={field.state.meta.errors.length > 0 || undefined}
                  className="w-full"
                  id={field.name}
                  onBlur={field.handleBlur}
                >
                  <span
                    className="flex flex-1 items-center text-left"
                    data-slot="select-value"
                  >
                    {vendorOptions.find((o) => o.value === field.state.value)
                      ?.label ?? "Select vendor"}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {vendorOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CustomField>
          <InputField label="Invoice Number" name="invoiceNumber" />
          <DateField isRequired label="Invoice Date" name="invoiceDate" />
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
          disabled={vendorOptions.length === 0}
          disableWhenInvalid={false}
          onCancel={onCancel}
          submitLabel={isEdit ? "Save changes" : "Submit"}
          submittingLabel={isEdit ? "Saving..." : "Submitting..."}
        />
      </FormLayout>
    );
  }

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
        {requestType === "reimbursement" ? (
          <DateField
            isRequired
            label="Expense Date"
            maxDate={new Date()}
            name="expenseDate"
          />
        ) : null}
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
            entityId={entityId}
            onChange={(attachments) => field.handleChange(attachments)}
            value={field.state.value}
          />
        )}
      </form.Field>

      <Separator />

      <FormActions
        cancelLabel="Cancel"
        disabled={bankAccountOptions.length === 0}
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel={isEdit ? "Save changes" : "Submit"}
        submittingLabel={isEdit ? "Saving..." : "Submitting..."}
      />
    </FormLayout>
  );
}
