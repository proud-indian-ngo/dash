import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { queries } from "@pi-dash/zero/queries";
import type {
  BankAccount,
  ExpenseCategory,
  Vendor,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { FormLayout } from "@/components/form/form-layout";
import { useStableQueryResult } from "@/hooks/use-stable-query-result";
import { newLineItem } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import type { RequestType } from "@/lib/request-types";
import { REQUEST_TYPE_LABELS } from "@/lib/request-types";
import {
  getDefaultValues,
  getFormSchema,
  type RequestFormValues,
  requestFormSchema,
} from "./form/request-form.schema";
import { buildMutation } from "./request-form-mutations";
import { TypeSelector } from "./request-type-selector";
import { StandardRequestFields } from "./standard-request-fields";
import { VendorRequestFields } from "./vendor-request-fields";

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
  const [categories, categoriesResult] = useQuery(
    queries.expenseCategory.all()
  );
  const [bankAccounts, bankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsByCurrentUser()
  );
  const [vendors, vendorsResult] = useQuery(queries.vendor.approved());
  const [pendingVendors, pendingVendorsResult] = useQuery(
    queries.vendor.pendingByCurrentUser()
  );

  const existingId = initialValues?.id;
  const isEdit = !!existingId;
  const entityId = existingId ?? uuidv7();

  const categoryList = useStableQueryResult(
    (categories ?? []) as ExpenseCategory[],
    categoriesResult
  );
  const bankAccountList = useStableQueryResult(
    (bankAccounts ?? []) as BankAccount[],
    bankAccountsResult
  );
  const approvedVendorList = useStableQueryResult(
    (vendors ?? []) as Vendor[],
    vendorsResult
  );
  const pendingVendorList = useStableQueryResult(
    (pendingVendors ?? []) as Vendor[],
    pendingVendorsResult
  );

  const vendorList = [...approvedVendorList, ...pendingVendorList].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  const bankAccountOptions = bankAccountList.map((account) => ({
    label: `${account.accountName} (••••${account.accountNumber.length >= 4 ? account.accountNumber.slice(-4) : account.accountNumber})`,
    value: account.id,
  }));

  const vendorOptions = vendorList.map((v) => ({
    label: v.status === "pending" ? `${v.name} (pending approval)` : v.name,
    value: v.id,
  }));

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);

  const defaultBankAccount =
    bankAccountList.find((a) => a.isDefault) ?? bankAccountList[0];

  const isVendorPayment = requestType === "vendor_payment";

  const strippedInitialValues = (() => {
    if (!initialValues || requestType === "reimbursement") {
      return initialValues;
    }
    const { expenseDate: _, ...rest } =
      initialValues as Partial<RequestFormValues> & {
        id?: string;
        expenseDate?: string;
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

  if (isVendorPayment) {
    return (
      <FormLayout className="flex flex-col gap-4" form={form}>
        <VendorRequestFields
          categoryList={categoryList}
          entityId={entityId}
          form={form}
          isEdit={isEdit}
          onCancel={onCancel}
          onVendorCreated={(id) => form.setFieldValue("vendorId", id)}
          onVendorDialogOpenChange={setVendorDialogOpen}
          vendorDialogOpen={vendorDialogOpen}
          vendorOptions={vendorOptions}
        />
      </FormLayout>
    );
  }

  return (
    <FormLayout className="flex flex-col gap-4" form={form}>
      <StandardRequestFields
        bankAccountList={bankAccountList}
        bankAccountOptions={bankAccountOptions}
        bankAccountsStatus={
          bankAccountsResult.type === "unknown"
            ? "loading"
            : bankAccountsResult.type
        }
        categoryList={categoryList}
        disableBankAccountSelection={disableBankAccountSelection}
        entityId={entityId}
        form={form}
        isEdit={isEdit}
        onBankAccountSelected={(account) => {
          form.setFieldValue("bankAccountNumber", account.accountNumber);
          form.setFieldValue("bankAccountIfscCode", account.ifscCode);
        }}
        onCancel={onCancel}
        requestType={requestType}
      />
    </FormLayout>
  );
}
