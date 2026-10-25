import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import type { BankAccount, ExpenseCategory } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useMemo, useRef, useState } from "react";
import { uuidv7 } from "uuidv7";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import type { CurrentChargeProgramme } from "@/components/expenses/charged-to-fields";
import { useRequestCity } from "@/components/expenses/use-request-city";
import { FormLayout } from "@/components/form/form-layout";
import { useApp } from "@/context/app-context";
import { useCashVoucherLimit } from "@/hooks/use-cash-voucher-limit";
import { newLineItem } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import type { RequestType } from "@/lib/reimbursement-types";
import { REQUEST_TYPE_LABELS } from "@/lib/reimbursement-types";
import { isAwaitingResult } from "@/lib/zero-result";

import { ClaimForField } from "./claim-for-field";
import { useClaimantOptions } from "./claimant-picker";
import {
  bankAccountFormFields,
  bankAccountOptionLabel,
  defaultBankAccountFor,
  shouldApplyDefaultBankAccount,
} from "./default-bank-account";
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
  const { cityOptions, defaultCostCentreId, toEventOptions } = useRequestCity(
    initialValues,
    isEdit
  );

  const entityId = existingId ?? uuidv7();

  const categoryList = (categories ?? []) as ExpenseCategory[];
  const bankAccountList = (bankAccounts ?? []) as BankAccount[];

  const eventOptions = toEventOptions(events ?? []);

  const bankAccountOptions = bankAccountList.map((account) => ({
    label: bankAccountOptionLabel(account),
    value: account.id,
  }));

  const defaultBankAccount = defaultBankAccountFor(bankAccountList);

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
    costCentreId: defaultCostCentreId,
    ...(defaultBankAccount && !("bankAccountName" in (initialValues ?? {}))
      ? bankAccountFormFields(defaultBankAccount)
      : {}),
    ...strippedInitialValues,
    attachments: initialValues?.attachments ?? [],
    lineItems: initialValues?.lineItems ?? [newLineItem()],
    type: requestType,
  } as RequestFormValues;

  const voucherLimitPaise = useCashVoucherLimit();
  const requestFormSchema = useMemo(
    () => createRequestFormSchema(voucherLimitPaise, cityOptions.length > 1),
    [voucherLimitPaise, cityOptions.length]
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
        forOthers ? claimantId : undefined,
        disableBankAccountSelection
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

  function setBankAccountFields(
    fields: ReturnType<typeof bankAccountFormFields>,
    options?: { dontUpdateMeta: boolean; dontValidate: boolean }
  ) {
    form.setFieldValue("bankAccountName", fields.bankAccountName, options);
    form.setFieldValue("bankAccountNumber", fields.bankAccountNumber, options);
    form.setFieldValue(
      "bankAccountIfscCode",
      fields.bankAccountIfscCode,
      options
    );
    form.setFieldValue("bankAccountUpiId", fields.bankAccountUpiId, options);
  }

  // A new request follows the (claimant's) default account as it syncs in
  // or changes, until the person picks an account in this form. Edits and
  // prefilled bank details keep what they were given.
  const followsDefaultBankAccount = !(
    isEdit || "bankAccountName" in (initialValues ?? {})
  );
  const bankAccountPickedByUser = useRef(false);
  useEffect(() => {
    if (
      !(
        defaultBankAccount &&
        shouldApplyDefaultBankAccount({
          current: {
            accountName: form.getFieldValue("bankAccountName"),
            accountNumber: form.getFieldValue("bankAccountNumber"),
            ifscCode: form.getFieldValue("bankAccountIfscCode"),
            upiId: form.getFieldValue("bankAccountUpiId"),
          },
          defaultAccount: defaultBankAccount,
          enabled: followsDefaultBankAccount,
          pickedByUser: bankAccountPickedByUser.current,
        })
      )
    ) {
      return;
    }
    // A default, not an edit: leave the fields untouched and unvalidated.
    const asDefault = { dontUpdateMeta: true, dontValidate: true };
    setBankAccountFields(bankAccountFormFields(defaultBankAccount), asDefault);
  }, [defaultBankAccount, followsDefaultBankAccount, form]);

  let bankAccountsStatus: "loading" | "complete" | "error" = "complete";

  if (bankAccountList.length === 0 && isAwaitingResult(bankAccountsResult)) {
    bankAccountsStatus = "loading";
  } else if (bankAccountsResult.type === "error") {
    bankAccountsStatus = "error";
  }

  const stableSelector0 = useEventCallback(
    (state: {
      values: {
        bankAccountNumber?: string;
        bankAccountUpiId?: string;
        chargedTo?: string;
      };
    }) => ({
      bankAccountNumber: state.values.bankAccountNumber,
      bankAccountUpiId: state.values.bankAccountUpiId,
      chargedTo: state.values.chargedTo,
    })
  );
  // The picker also fills in an account on its own when the stored one
  // isn't listed; only a person's pick stops the default from following.
  const handleBankAccountSelected = useEventCallback(
    (account: BankAccount, source: "auto" | "user") => {
      if (source === "user") {
        bankAccountPickedByUser.current = true;
      }
      setBankAccountFields(bankAccountFormFields(account));
    }
  );
  // A new claimant means a new set of accounts: clear the old choice so the
  // claimant's default fills in.
  const handleClaimantChange = useEventCallback((nextId: string) => {
    if (nextId === claimantId) {
      return;
    }
    setBankAccountFields({
      bankAccountIfscCode: "",
      bankAccountName: "",
      bankAccountNumber: "",
      bankAccountUpiId: "",
    });
    bankAccountPickedByUser.current = false;
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
        {({ bankAccountNumber, bankAccountUpiId, chargedTo }) => {
          // On an event, the claim takes the event's city: no picker.
          const showsCity = cityOptions.length > 1 && chargedTo !== "event";
          return (
            <StandardReimbursementFields
              bankAccountList={bankAccountList}
              bankAccountNumber={bankAccountNumber}
              bankAccountUpiId={bankAccountUpiId}
              bankAccountsKey={claimantId}
              claimantName={claimantName}
              bankAccountOptions={bankAccountOptions}
              bankAccountsStatus={bankAccountsStatus}
              categoryList={categoryList}
              cityOptions={showsCity ? cityOptions : []}
              currentChargeProgramme={currentChargeProgramme}
              disableBankAccountSelection={disableBankAccountSelection}
              eventOptions={eventOptions}
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
