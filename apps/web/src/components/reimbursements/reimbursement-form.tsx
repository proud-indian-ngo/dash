import { queries } from "@pi-dash/zero/queries";
import type {
  BankAccount,
  ExpenseCategory,
  TeamEvent,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useEffect, useRef } from "react";
import { uuidv7 } from "uuidv7";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { FormLayout } from "@/components/form/form-layout";
import { newLineItem } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import type { RequestType } from "@/lib/reimbursement-types";
import { REQUEST_TYPE_LABELS } from "@/lib/reimbursement-types";
import {
  getDefaultValues,
  getFormSchema,
  type RequestFormValues,
  requestFormSchema,
} from "./form/reimbursement-form.schema";
import { buildMutation } from "./reimbursement-form-mutations";
import { StandardReimbursementFields } from "./standard-reimbursement-fields";

export interface ReimbursementFormProps {
  disableBankAccountSelection?: boolean;
  initialValues?: Partial<RequestFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
  requestType: RequestType;
}

export function ReimbursementForm({
  disableBankAccountSelection = false,
  initialValues,
  onCancel,
  onSaved,
  requestType,
}: ReimbursementFormProps) {
  return (
    <AppErrorBoundary level="section">
      <ReimbursementFormInner
        disableBankAccountSelection={disableBankAccountSelection}
        initialValues={initialValues}
        onCancel={onCancel}
        onSaved={onSaved}
        requestType={requestType}
      />
    </AppErrorBoundary>
  );
}

interface ReimbursementFormInnerProps {
  disableBankAccountSelection: boolean;
  initialValues?: Partial<RequestFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
  requestType: RequestType;
}

function ReimbursementFormInner({
  disableBankAccountSelection,
  initialValues,
  onCancel,
  onSaved,
  requestType,
}: ReimbursementFormInnerProps) {
  const zero = useZero();
  const [categories] = useQuery(queries.expenseCategory.all());
  const [bankAccounts, bankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsByCurrentUser()
  );
  const [events] = useQuery(queries.teamEvent.allAccessible());

  const existingId = initialValues?.id;
  const isEdit = !!existingId;
  const entityId = existingId ?? uuidv7();

  const categoryList = (categories ?? []) as ExpenseCategory[];
  const bankAccountList = (bankAccounts ?? []) as BankAccount[];
  const eventList = (events ?? []) as TeamEvent[];

  function getFilteredEventOptions(selectedCity: string | undefined) {
    const filtered = selectedCity
      ? eventList.filter((e) => e.city === selectedCity)
      : eventList;
    return filtered.map((e) => ({
      label: `${e.name} (${format(new Date(e.startTime), "MMM d, yyyy")})`,
      value: e.id,
    }));
  }

  const bankAccountOptions = bankAccountList.map((account) => ({
    label: `${account.accountName} (••••${account.accountNumber.length >= 4 ? account.accountNumber.slice(-4) : account.accountNumber})`,
    value: account.id,
  }));

  const defaultBankAccount =
    bankAccountList.find((a) => a.isDefault) ?? bankAccountList[0];

  const strippedInitialValues = (() => {
    if (!initialValues || requestType === "reimbursement") {
      return initialValues;
    }
    const { expenseDate: _, ...rest } =
      initialValues as Partial<RequestFormValues> & {
        id?: string;
        expenseDate?: Date;
      };
    return rest;
  })();

  const form = useForm({
    defaultValues: {
      ...getDefaultValues(requestType),
      ...(defaultBankAccount && !("bankAccountName" in (initialValues ?? {}))
        ? {
            bankAccountName: defaultBankAccount.accountName,
            bankAccountNumber: defaultBankAccount.accountNumber,
            bankAccountIfscCode: defaultBankAccount.ifscCode,
          }
        : {}),
      ...strippedInitialValues,
      type: requestType,
      lineItems: initialValues?.lineItems ?? [newLineItem()],
      attachments: initialValues?.attachments ?? [],
    },
    onSubmit: async ({ value: rawValue }) => {
      const value = requestFormSchema.parse(rawValue);
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
      onChange: getFormSchema(requestType),
      onSubmit: getFormSchema(requestType),
    },
  });

  const hasInitialBankAccount = "bankAccountName" in (initialValues ?? {});
  const bankAccountApplied = useRef(false);
  useEffect(() => {
    if (
      bankAccountApplied.current ||
      !defaultBankAccount ||
      isEdit ||
      hasInitialBankAccount
    ) {
      return;
    }
    if (!form.getFieldValue("bankAccountName")) {
      form.setFieldValue("bankAccountName", defaultBankAccount.accountName);
      form.setFieldValue("bankAccountNumber", defaultBankAccount.accountNumber);
      form.setFieldValue("bankAccountIfscCode", defaultBankAccount.ifscCode);
      bankAccountApplied.current = true;
    }
  }, [defaultBankAccount, form, isEdit, hasInitialBankAccount]);

  let bankAccountsStatus: "loading" | "complete" | "error" = "complete";
  if (bankAccountList.length === 0 && bankAccountsResult.type !== "complete") {
    bankAccountsStatus = "loading";
  } else if (bankAccountsResult.type === "error") {
    bankAccountsStatus = "error";
  }

  return (
    <FormLayout className="flex flex-col gap-4" form={form}>
      <form.Subscribe
        selector={(state) => ({
          city: state.values.city,
          eventId: state.values.eventId,
        })}
      >
        {({ city: selectedCity, eventId }) => {
          const filteredOptions = getFilteredEventOptions(selectedCity);
          if (eventId && !filteredOptions.some((o) => o.value === eventId)) {
            setTimeout(() => form.setFieldValue("eventId", undefined), 0);
          }
          return (
            <StandardReimbursementFields
              bankAccountList={bankAccountList}
              bankAccountOptions={bankAccountOptions}
              bankAccountsStatus={bankAccountsStatus}
              categoryList={categoryList}
              disableBankAccountSelection={disableBankAccountSelection}
              entityId={entityId}
              eventOptions={filteredOptions}
              form={form}
              isEdit={isEdit}
              onBankAccountSelected={(account) => {
                form.setFieldValue("bankAccountNumber", account.accountNumber);
                form.setFieldValue("bankAccountIfscCode", account.ifscCode);
              }}
              onCancel={onCancel}
              requestType={requestType}
            />
          );
        }}
      </form.Subscribe>
    </FormLayout>
  );
}
