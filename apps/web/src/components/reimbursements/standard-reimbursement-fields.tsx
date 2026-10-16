import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { BankAccount, ExpenseCategory } from "@pi-dash/zero/schema";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  ChargedToFields,
  type CurrentChargeProgramme,
} from "@/components/expenses/charged-to-fields";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { ComboboxField } from "@/components/form/combobox-field";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import type {
  FormFieldApi,
  FormWithField,
} from "@/components/form/form-context";
import {
  fieldErrorProps,
  useFormSubmitted,
  useResolvedForm,
} from "@/components/form/form-context";
import { InputField } from "@/components/form/input-field";
import { LineItemsEditor } from "@/components/form/line-items-editor";
import type { SelectOption } from "@/components/form/select-field";
import { SelectField } from "@/components/form/select-field";
import type { Attachment } from "@/lib/form-schemas";
import { cityOptions } from "@/lib/form-schemas";
import type { RequestType } from "@/lib/reimbursement-types";

interface StandardReimbursementFieldsProps {
  bankAccountList: BankAccount[];
  /** The form's current account number, read reactively from form state. */
  bankAccountNumber: string | undefined;
  /** Remounts the bank account picker when the claimant changes. */
  bankAccountsKey?: string;
  bankAccountOptions: { label: string; value: string }[];
  bankAccountsStatus: "loading" | "complete" | "error";
  categoryList: ExpenseCategory[];
  /** Set when raising for someone else: whose accounts are listed. */
  claimantName?: string;
  currentChargeProgramme?: CurrentChargeProgramme | null;
  disableBankAccountSelection: boolean;
  eventOptions: SelectOption[];
  form: FormWithField;
  isEdit: boolean;
  onBankAccountSelected: (
    account: BankAccount,
    source: "auto" | "user"
  ) => void;
  onCancel: () => void;
  /**
   * The claimant's name for the "paid to the claimant" box when they aren't
   * the person filling in the form; omitted, the box reads "Paid to me".
   */
  payeeClaimantName?: string;
  requestType: RequestType;
}

function BankAccountSelect({
  bankAccountList,
  bankAccountNumber,
  bankAccountOptions,
  disableBankAccountSelection,
  field,
  onBankAccountSelected,
  submitted,
}: {
  bankAccountList: BankAccount[];
  /**
   * Passed in rather than read with `form.getFieldValue`: the React Compiler
   * caches that read against the stable `form`, so a default applied by the
   * form wouldn't show until the account list changed.
   */
  bankAccountNumber: string | undefined;
  bankAccountOptions: { label: string; value: string }[];
  disableBankAccountSelection: boolean;
  field: FormFieldApi<string | undefined>;
  onBankAccountSelected: (
    account: BankAccount,
    source: "auto" | "user"
  ) => void;
  submitted: boolean;
}) {
  const selectedAccountByNumber = bankAccountList.find(
    (account) => account.accountNumber === bankAccountNumber
  );
  const selectedAccount =
    selectedAccountByNumber ??
    bankAccountList.find((account) => account.isDefault) ??
    bankAccountList.find(
      (account) => account.accountName === field.state.value
    );
  const [selectedAccountId, setSelectedAccountId] = useState(
    selectedAccount?.id ?? ""
  );
  const selectedOptionId = selectedAccountId;
  const selectedOptionLabel =
    bankAccountOptions.find((option) => option.value === selectedOptionId)
      ?.label ?? field.state.value;

  useEffect(() => {
    setSelectedAccountId(selectedAccount?.id ?? "");
    if (selectedAccount && !selectedAccountByNumber) {
      onBankAccountSelected(selectedAccount, "auto");
    }
  }, [onBankAccountSelected, selectedAccount, selectedAccountByNumber]);

  const handleOpenChange = useEventCallback((open: boolean) => {
    if (!open) {
      field.handleBlur();
    }
  });
  const handleValueChange = useEventCallback((accountId: string | null) => {
    if (!accountId) {
      return;
    }

    const account = bankAccountList.find((entry) => entry.id === accountId);

    if (account) {
      setSelectedAccountId(account.id);
      field.handleChange(account.accountName);
      onBankAccountSelected(account, "user");
    }
  });

  return (
    <Select
      disabled={disableBankAccountSelection}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      value={selectedOptionId}
    >
      <SelectTrigger
        {...fieldErrorProps(field, submitted)}
        className="w-full"
        id={field.name}
      >
        <span
          className="flex flex-1 items-center text-left"
          data-slot="select-value"
        >
          {selectedOptionLabel ?? "Select bank account"}
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
}

/**
 * Opens bank account settings in a new tab, so the claim being written isn't
 * lost; the new account syncs back into this form's options.
 */
function BankAccountsSettingsLink() {
  return (
    <Link
      className="text-foreground underline underline-offset-2"
      rel="noopener"
      target="_blank"
      to="/settings/bank-accounts"
    >
      Settings &rarr; Bank accounts
    </Link>
  );
}

export function StandardReimbursementFields({
  bankAccountList,
  bankAccountNumber,
  bankAccountOptions,
  bankAccountsKey,
  bankAccountsStatus,
  categoryList,
  claimantName,
  currentChargeProgramme,
  disableBankAccountSelection,
  eventOptions,
  form,
  onBankAccountSelected,
  isEdit,
  onCancel,
  payeeClaimantName,
  requestType,
}: StandardReimbursementFieldsProps) {
  const resolvedForm = useResolvedForm(
    undefined,
    "StandardReimbursementFields"
  );
  const submitted = useFormSubmitted(resolvedForm);

  function renderBankAccountField() {
    if (bankAccountOptions.length > 0) {
      return (
        <CustomField<string | undefined>
          isRequired
          description={
            claimantName ? `${claimantName}'s saved accounts` : undefined
          }
          label="Bank account"
          name="bankAccountName"
        >
          {(field) => {
            return (
              <BankAccountSelect
                bankAccountList={bankAccountList}
                bankAccountNumber={bankAccountNumber}
                key={bankAccountsKey}
                bankAccountOptions={bankAccountOptions}
                disableBankAccountSelection={disableBankAccountSelection}
                field={field}
                onBankAccountSelected={onBankAccountSelected}
                submitted={submitted}
              />
            );
          }}
        </CustomField>
      );
    }

    if (bankAccountsStatus === "loading") {
      return null;
    }

    if (bankAccountsStatus === "error") {
      return (
        <p className="text-destructive text-sm">
          Failed to load bank accounts. Check your connection and try again.
        </p>
      );
    }

    if (claimantName) {
      return (
        <p className="text-muted-foreground text-sm">
          {claimantName} has no saved bank account. They need to add one in
          Settings &rarr; Bank accounts before you can raise this for them.
        </p>
      );
    }

    return (
      <p className="text-muted-foreground text-sm">
        No bank account found. Add one in <BankAccountsSettingsLink /> to
        receive payments.
      </p>
    );
  }

  return (
    <>
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
            label="Expense date"
            maxDate={new Date()}
            name="expenseDate"
          />
        ) : null}
        {renderBankAccountField()}
      </div>

      {requestType === "reimbursement" ? (
        <ChargedToFields
          currentProgramme={currentChargeProgramme}
          eventField={
            <ComboboxField
              emptyMessage="No matching events."
              isRequired
              label="Event"
              name="eventId"
              options={eventOptions}
              placeholder="Search events"
            />
          }
        />
      ) : null}

      <Separator />

      <LineItemsEditor
        categories={categoryList}
        claimantName={payeeClaimantName}
        showVoucher={requestType === "reimbursement"}
      />

      <Separator />

      <form.Field name="attachments">
        {(field: FormFieldApi<unknown[]>) => (
          <AttachmentsSection
            fileDownloadKind={
              requestType === "reimbursement"
                ? "reimbursementAttachment"
                : "advancePaymentAttachment"
            }
            onChange={field.handleChange}
            value={field.state.value as Attachment[]}
          />
        )}
      </form.Field>

      <Separator />

      <FormActions
        cancelLabel="Cancel"
        disabled={bankAccountOptions.length === 0}
        disableWhenInvalid={false}
        onCancel={onCancel}
        submitLabel={
          isEdit
            ? "Save changes"
            : requestType === "reimbursement"
              ? "Submit reimbursement"
              : "Submit advance payment"
        }
        submittingLabel={isEdit ? "Saving..." : "Submitting..."}
      />
    </>
  );
}
