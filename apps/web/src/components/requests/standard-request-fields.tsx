import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@pi-dash/design-system/components/ui/select";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import type { BankAccount, ExpenseCategory } from "@pi-dash/zero/schema";
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
import { SelectField } from "@/components/form/select-field";
import { useApp } from "@/context/app-context";
import type { Attachment } from "@/lib/form-schemas";
import { cityOptions } from "@/lib/form-schemas";
import type { RequestType } from "@/lib/request-types";

interface StandardRequestFieldsProps {
  bankAccountList: BankAccount[];
  bankAccountOptions: { label: string; value: string }[];
  bankAccountsStatus: "loading" | "complete" | "error";
  categoryList: ExpenseCategory[];
  disableBankAccountSelection: boolean;
  entityId: string;
  form: FormWithField;
  isEdit: boolean;
  onBankAccountSelected: (account: BankAccount) => void;
  onCancel: () => void;
  requestType: RequestType;
}

export function StandardRequestFields({
  bankAccountList,
  bankAccountOptions,
  bankAccountsStatus,
  categoryList,
  disableBankAccountSelection,
  entityId,
  form,
  onBankAccountSelected,
  isEdit,
  onCancel,
  requestType,
}: StandardRequestFieldsProps) {
  const { openSettings } = useApp();
  const resolvedForm = useResolvedForm(undefined, "StandardRequestFields");

  function renderBankAccountField() {
    if (bankAccountOptions.length > 0) {
      return (
        <CustomField<string | undefined>
          isRequired
          label="Bank Account"
          name="bankAccountName"
        >
          {(field) => {
            const selectedAccount = bankAccountList.find(
              (account) =>
                account.accountNumber ===
                form.getFieldValue("bankAccountNumber")
            );
            const submitted = resolvedForm.state.submissionAttempts > 0;

            return (
              <Select
                disabled={disableBankAccountSelection}
                onValueChange={(accountId) => {
                  const account = bankAccountList.find(
                    (entry) => entry.id === accountId
                  );

                  if (account) {
                    field.handleChange(account.accountName);
                    onBankAccountSelected(account);
                  }
                }}
                value={selectedAccount?.id ?? ""}
              >
                <SelectTrigger
                  {...fieldErrorProps(field, submitted)}
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
        <button
          className="text-foreground underline underline-offset-2"
          onClick={() => openSettings("banking")}
          type="button"
        >
          Settings &rarr; Banking
        </button>{" "}
        to receive payments.
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
        {renderBankAccountField()}
      </div>

      <Separator />

      <LineItemsEditor categories={categoryList} />

      <Separator />

      <form.Field name="attachments">
        {(field: FormFieldApi<unknown[]>) => (
          <AttachmentsSection
            entityId={entityId}
            onChange={(attachments) => field.handleChange(attachments)}
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
