import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import type {
  BankAccount,
  ExpenseCategory,
  TeamEvent,
} from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import type { CurrentChargeProgramme } from "@/components/expenses/charged-to-fields";
import { FormLayout } from "@/components/form/form-layout";
import { useApp } from "@/context/app-context";
import { useCashVoucherLimit } from "@/hooks/use-cash-voucher-limit";
import { DATE } from "@/lib/date-formats";
import { newLineItem } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import type { RequestType } from "@/lib/reimbursement-types";
import { REQUEST_TYPE_LABELS } from "@/lib/reimbursement-types";

import { ClaimForField } from "./claim-for-field";
import { useClaimantOptions } from "./claimant-picker";
import {
  getDefaultValues,
  type RequestFormValues,
  createRequestFormSchema,
} from "./form/reimbursement-form.schema";
import { buildMutation } from "./reimbursement-form-mutations";
import { StandardReimbursementFields } from "./standard-reimbursement-fields";

export interface ReimbursementFormProps {
  /** When editing someone else's claim: the claimant's name. */
  claimantName?: string;
  /** The programme the request is charged to, kept listed when editing. */
  currentChargeProgramme?: CurrentChargeProgramme | null;
  disableBankAccountSelection?: boolean;
  initialValues?: Partial<RequestFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
  requestType: RequestType;
}

export function ReimbursementForm({
  claimantName,
  currentChargeProgramme,
  disableBankAccountSelection = false,
  initialValues,
  onCancel,
  onSaved,
  requestType,
}: ReimbursementFormProps) {
  return (
    <AppErrorBoundary level="section">
      <ReimbursementFormInner
        claimantName={claimantName}
        currentChargeProgramme={currentChargeProgramme}
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
  claimantName?: string;
  currentChargeProgramme?: CurrentChargeProgramme | null;
  disableBankAccountSelection: boolean;
  initialValues?: Partial<RequestFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
  requestType: RequestType;
}

function ReimbursementFormInner({
  claimantName: editedClaimantName,
  currentChargeProgramme,
  disableBankAccountSelection,
  initialValues,
  onCancel,
  onSaved,
  requestType,
}: ReimbursementFormInnerProps) {
  const zero = useZero();
  const { hasPermission, user } = useApp();
  const existingId = initialValues?.id;
  const isEdit = !!existingId;
  // Finance raises a new reimbursement for someone else; the claimant owns
  // it and is paid to one of their own saved accounts.
  const canClaimForOthers =
    requestType === "reimbursement" &&
    !isEdit &&
    hasPermission("requests.create_for_others");
  const [claimantId, setClaimantId] = useState(user.id);
  const forOthers = canClaimForOthers && claimantId !== user.id;
  const claimants = useClaimantOptions(canClaimForOthers);
  const claimantName = forOthers
    ? (claimants.find((c) => c.id === claimantId)?.name ?? "The claimant")
    : undefined;
  // Names the claimant on the "paid to the claimant" box unless it's you.
  const payeeClaimantName = forOthers
    ? (claimants.find((c) => c.id === claimantId)?.name ?? "")
    : editedClaimantName;

  const [categories] = useQuery(queries.expenseCategory.all());
  const [ownBankAccounts, ownBankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsByCurrentUser(),
    { enabled: !forOthers }
  );
  const [claimantBankAccounts, claimantBankAccountsResult] = useQuery(
    queries.bankAccount.bankAccountsForClaimant({ userId: claimantId }),
    { enabled: forOthers }
  );
  const bankAccounts = forOthers ? claimantBankAccounts : ownBankAccounts;
  const bankAccountsResult = forOthers
    ? claimantBankAccountsResult
    : ownBankAccountsResult;
  const [events] = useQuery(queries.teamEvent.allAccessible());

  const entityId = existingId ?? uuidv7();

  const categoryList = (categories ?? []) as ExpenseCategory[];
  const bankAccountList = (bankAccounts ?? []) as BankAccount[];
  const eventList = (events ?? []) as TeamEvent[];

  function getFilteredEventOptions(selectedCity: string | undefined) {
    const filtered = selectedCity
      ? eventList.filter((e) => e.city === selectedCity)
      : eventList;
    return filtered.map((e) => ({
      label: `${e.name} (${format(new Date(e.startTime), DATE)})`,
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

  const defaultValues: RequestFormValues = {
    ...getDefaultValues(requestType),
    ...(defaultBankAccount && !("bankAccountName" in (initialValues ?? {}))
      ? {
          bankAccountIfscCode: defaultBankAccount.ifscCode,
          bankAccountName: defaultBankAccount.accountName,
          bankAccountNumber: defaultBankAccount.accountNumber,
        }
      : {}),
    ...strippedInitialValues,
    attachments: initialValues?.attachments ?? [],
    lineItems: initialValues?.lineItems ?? [newLineItem()],
    type: requestType,
  } as RequestFormValues;

  const voucherLimitPaise = useCashVoucherLimit();
  const requestFormSchema = useMemo(
    () => createRequestFormSchema(voucherLimitPaise),
    [voucherLimitPaise]
  );

  const form = useForm({
    defaultValues,
    onSubmit: async ({ value: rawValue }) => {
      const value = requestFormSchema.parse(rawValue);
      const id = entityId;
      const typeLabel = REQUEST_TYPE_LABELS[value.type];
      const mutation = buildMutation(
        zero,
        value,
        id,
        existingId,
        bankAccountList,
        voucherLimitPaise,
        forOthers ? claimantId : undefined
      );

      const mutatorNameMap = {
        advance_payment: "advancePayment",
        reimbursement: "reimbursement",
        vendor_payment: "vendorPayment",
      } as const;
      const mutatorName = mutatorNameMap[value.type];

      const res = await mutation.server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: `Failed to submit ${typeLabel.toLowerCase()}`,
        mutation: `${mutatorName}.${existingId ? "update" : "create"}`,
        successMsg: `${typeLabel} submitted`,
      });
      if (res.type !== "error") {
        onSaved(id);
      }
    },
    validators: {
      onChange: requestFormSchema,
      onSubmit: requestFormSchema,
    },
  });

  const hasInitialBankAccount = "bankAccountName" in (initialValues ?? {});
  const autoBankAccountNumber = useRef(defaultBankAccount?.accountNumber);
  useEffect(() => {
    if (!defaultBankAccount || isEdit || hasInitialBankAccount) {
      return;
    }
    const currentBankAccountNumber = form.getFieldValue("bankAccountNumber");
    if (
      !currentBankAccountNumber ||
      currentBankAccountNumber === autoBankAccountNumber.current
    ) {
      form.setFieldValue("bankAccountName", defaultBankAccount.accountName);
      form.setFieldValue("bankAccountNumber", defaultBankAccount.accountNumber);
      form.setFieldValue("bankAccountIfscCode", defaultBankAccount.ifscCode);
      autoBankAccountNumber.current = defaultBankAccount.accountNumber;
    }
  }, [defaultBankAccount, form, isEdit, hasInitialBankAccount]);

  let bankAccountsStatus: "loading" | "complete" | "error" = "complete";

  if (bankAccountList.length === 0 && bankAccountsResult.type !== "complete") {
    bankAccountsStatus = "loading";
  } else if (bankAccountsResult.type === "error") {
    bankAccountsStatus = "error";
  }

  const stableSelector0 = useEventCallback(
    (state: {
      values: { bankAccountNumber?: string; city?: string; eventId?: string };
    }) => ({
      bankAccountNumber: state.values.bankAccountNumber,
      city: state.values.city,
      eventId: state.values.eventId,
    })
  );
  // The picker fills in the default account on its own (after a claimant
  // change, the fields start empty), so set the name too.
  const handleBankAccountSelected = useEventCallback((account: BankAccount) => {
    form.setFieldValue("bankAccountName", account.accountName);
    form.setFieldValue("bankAccountNumber", account.accountNumber);
    form.setFieldValue("bankAccountIfscCode", account.ifscCode);
  });
  // A new claimant means a new set of accounts: clear the old choice so the
  // claimant's default fills in.
  const handleClaimantChange = useEventCallback((nextId: string) => {
    if (nextId === claimantId) {
      return;
    }
    form.setFieldValue("bankAccountName", "");
    form.setFieldValue("bankAccountNumber", "");
    form.setFieldValue("bankAccountIfscCode", "");
    autoBankAccountNumber.current = undefined;
    setClaimantId(nextId);
  });

  return (
    <FormLayout className="flex flex-col gap-4" form={form}>
      {canClaimForOthers ? (
        <ClaimForField
          claimantId={claimantId}
          claimants={claimants}
          currentUser={user}
          onChange={handleClaimantChange}
        />
      ) : null}
      <form.Subscribe selector={stableSelector0}>
        {({ city: selectedCity, eventId }) => {
          const filteredOptions = getFilteredEventOptions(selectedCity);
          if (eventId && !filteredOptions.some((o) => o.value === eventId)) {
            setTimeout(() => form.setFieldValue("eventId", undefined), 0);
          }
          return (
            <StandardReimbursementFields
              bankAccountList={bankAccountList}
              bankAccountsKey={claimantId}
              claimantName={claimantName}
              bankAccountOptions={bankAccountOptions}
              bankAccountsStatus={bankAccountsStatus}
              categoryList={categoryList}
              currentChargeProgramme={currentChargeProgramme}
              disableBankAccountSelection={disableBankAccountSelection}
              eventOptions={filteredOptions}
              form={form}
              isEdit={isEdit}
              onBankAccountSelected={handleBankAccountSelected}
              onCancel={onCancel}
              payeeClaimantName={payeeClaimantName}
              requestType={requestType}
            />
          );
        }}
      </form.Subscribe>
    </FormLayout>
  );
}
