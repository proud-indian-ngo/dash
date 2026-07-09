import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { BankAccount, ExpenseCategory } from "@pi-dash/zero/schema";
import { useEffect, useState } from "react";
import { AttachmentsSection } from "@/components/form/attachments-section";
import { CustomField } from "@/components/form/custom-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import type {
  FormFieldApi,
  FormWithField,
} from "@/components/form/form-context";
import {
  fieldErrorProps,
  useResolvedForm,
} from "@/components/form/form-context";
import { InputField } from "@/components/form/input-field";
import { LineItemsEditor } from "@/components/form/line-items-editor";
import type { SelectOption } from "@/components/form/select-field";
import { SelectField } from "@/components/form/select-field";
import { useApp } from "@/context/app-context";
import type { Attachment } from "@/lib/form-schemas";
import { cityOptions } from "@/lib/form-schemas";
import type { RequestType } from "@/lib/reimbursement-types";

interface StandardReimbursementFieldsProps {
  bankAccountList: BankAccount[];
  bankAccountOptions: { label: string; value: string }[];
  bankAccountsStatus: "loading" | "complete" | "error";
  categoryList: ExpenseCategory[];
  disableBankAccountSelection: boolean;
  entityId: string;
  eventOptions: SelectOption[];
  form: FormWithField;
  isEdit: boolean;
  onBankAccountSelected: (account: BankAccount) => void;
  onCancel: () => void;
  requestType: RequestType;
}

function BankAccountSelect({
  bankAccountList,
  bankAccountOptions,
  disableBankAccountSelection,
  field,
  form,
  onBankAccountSelected,
  submitted,
}: {
  bankAccountList: BankAccount[];
  bankAccountOptions: { label: string; value: string }[];
  disableBankAccountSelection: boolean;
  field: FormFieldApi<string | undefined>;
  form: FormWithField;
  onBankAccountSelected: (account: BankAccount) => void;
  submitted: boolean;
}) {
  const selectedAccountByNumber = bankAccountList.find(
    (account) =>
      account.accountNumber === form.getFieldValue("bankAccountNumber")
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
      onBankAccountSelected(selectedAccount);
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
      onBankAccountSelected(account);
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

function OpenBankingSettingsButton({
  onOpen,
}: {
  onOpen: (section: "banking") => void;
}) {
  const handleClick = useEventCallback(() => onOpen("banking"));

  return (
    <button
      className="text-foreground underline underline-offset-2"
      onClick={handleClick}
      type="button"
    >
      Settings &rarr; Banking
    </button>
  );
}

function EventCombobox({
  eventOptions,
  field,
}: {
  eventOptions: SelectOption[];
  field: FormFieldApi<string | undefined>;
}) {
  const items = ["", ...eventOptions.map((o) => o.value)];
  const optionMap = new Map(eventOptions.map((o) => [o.value, o.label]));
  const itemToStringLabel = useEventCallback((value: string) =>
    value === "" ? "No event" : (optionMap.get(value) ?? String(value))
  );
  const handleValueChange = useEventCallback((value: string | null) =>
    field.handleChange(value === "" || value === null ? undefined : value)
  );

  return (
    <Combobox
      items={items}
      itemToStringLabel={itemToStringLabel}
      onValueChange={handleValueChange}
      value={field.state.value ?? ""}
    >
      <ComboboxInput
        className="w-full"
        id={field.name}
        onBlur={field.handleBlur}
        placeholder="No event"
        showClear={!!field.state.value}
      />
      <ComboboxContent>
        <ComboboxList>
          {(itemValue) => (
            <ComboboxItem key={itemValue} value={itemValue}>
              {itemValue === ""
                ? "No event"
                : (optionMap.get(itemValue) ?? itemValue)}
            </ComboboxItem>
          )}
        </ComboboxList>
        <ComboboxEmpty>No matching events.</ComboboxEmpty>
      </ComboboxContent>
    </Combobox>
  );
}

export function StandardReimbursementFields({
  bankAccountList,
  bankAccountOptions,
  bankAccountsStatus,
  categoryList,
  disableBankAccountSelection,
  entityId,
  eventOptions,
  form,
  onBankAccountSelected,
  isEdit,
  onCancel,
  requestType,
}: StandardReimbursementFieldsProps) {
  const { openSettings } = useApp();
  const resolvedForm = useResolvedForm(
    undefined,
    "StandardReimbursementFields"
  );

  function renderBankAccountField() {
    if (bankAccountOptions.length > 0) {
      return (
        <CustomField<string | undefined>
          isRequired
          label="Bank Account"
          name="bankAccountName"
        >
          {(field) => {
            const submitted = resolvedForm.state.submissionAttempts > 0;

            return (
              <BankAccountSelect
                bankAccountList={bankAccountList}
                bankAccountOptions={bankAccountOptions}
                disableBankAccountSelection={disableBankAccountSelection}
                field={field}
                form={form}
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

    return (
      <p className="text-muted-foreground text-sm">
        No bank account found. Add one in{" "}
        <OpenBankingSettingsButton onOpen={openSettings} /> to receive payments.
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
            label="Expense Date"
            maxDate={new Date()}
            name="expenseDate"
          />
        ) : null}
        {requestType === "reimbursement" ? (
          <CustomField<string | undefined> label="Event" name="eventId">
            {(field) => (
              <EventCombobox eventOptions={eventOptions} field={field} />
            )}
          </CustomField>
        ) : null}
        {renderBankAccountField()}
      </div>

      <Separator />

      <LineItemsEditor categories={categoryList} showVoucher />

      <Separator />

      <form.Field name="attachments">
        {(field: FormFieldApi<unknown[]>) => (
          <AttachmentsSection
            entityId={entityId}
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
        submitLabel={isEdit ? "Save changes" : "Submit"}
        submittingLabel={isEdit ? "Saving..." : "Submitting..."}
      />
    </>
  );
}
