import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";
import z from "zod";

import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import {
  fieldErrorProps,
  useFormSubmitted,
} from "@/components/form/form-context";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import { handleMutationResult } from "@/lib/mutation-result";

import { ClaimantCombobox, useClaimantOptions } from "./claimant-picker";

const changeClaimantFormSchema = z.object({
  bankAccountId: z.string().optional(),
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason")
    .max(500, "Keep the reason under 500 characters"),
  userId: z.string().min(1, "Choose the new claimant"),
});

type ChangeClaimantValues = z.input<typeof changeClaimantFormSchema>;

interface ChangeClaimantRequest {
  id: string;
  status: null | string;
  title: string;
  userId: string;
}

function maskedLabel(account: { accountName: string; accountNumber: string }) {
  const last4 =
    account.accountNumber.length >= 4
      ? account.accountNumber.slice(-4)
      : account.accountNumber;
  return `${account.accountName} (••••${last4})`;
}

/**
 * The new claimant's saved accounts. Picks their default (or first) when the
 * claimant changes, and says so when they have none: the details are then
 * cleared.
 */
function ClaimantBankAccountField({
  claimantName,
  getAccountId,
  setAccountId,
  userId,
}: {
  claimantName: string;
  getAccountId: () => string | undefined;
  setAccountId: (accountId: string | undefined) => void;
  userId: string;
}) {
  const [accounts, result] = useQuery(
    queries.bankAccount.bankAccountsForClaimant({ userId })
  );
  const loading = accounts.length === 0 && result.type !== "complete";

  useEffect(() => {
    if (loading) {
      return;
    }
    const current = getAccountId();
    if (current && accounts.some((a) => a.id === current)) {
      return;
    }
    const fallback = accounts.find((a) => a.isDefault) ?? accounts[0];
    setAccountId(fallback?.id);
  }, [accounts, getAccountId, loading, setAccountId]);

  if (loading) {
    return null;
  }
  if (accounts.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {claimantName} has no saved bank account, so the bank details on this
        reimbursement will be cleared. They can add one in Settings &rarr; Bank
        accounts.
      </p>
    );
  }
  return (
    <SelectField
      description={`${claimantName}'s saved accounts`}
      isRequired
      label="Bank account"
      name="bankAccountId"
      options={accounts.map((account) => ({
        label: maskedLabel(account),
        value: account.id,
      }))}
      placeholder="Select bank account"
    />
  );
}

function ChangeClaimantForm({
  onOpenChange,
  request,
}: {
  onOpenChange: (open: boolean) => void;
  request: ChangeClaimantRequest;
}) {
  const zero = useZero();
  const people = useClaimantOptions(true);
  const candidates = people.filter((p) => p.id !== request.userId);
  const nameOf = (id: string) =>
    candidates.find((p) => p.id === id)?.name ?? "The new claimant";

  const form = useForm({
    defaultValues: {
      bankAccountId: undefined,
      reason: "",
      userId: "",
    } as ChangeClaimantValues,
    onSubmit: async ({ value: rawValue }) => {
      const value = changeClaimantFormSchema.parse(rawValue);
      const res = await zero.mutate(
        mutators.reimbursement.changeClaimant({
          bankAccountId: value.bankAccountId ?? null,
          id: request.id,
          previousUserId: request.userId,
          reason: value.reason,
          userId: value.userId,
        })
      ).server;
      handleMutationResult(res, {
        entityId: request.id,
        errorMsg: "Couldn't change the claimant",
        mutation: "reimbursement.changeClaimant",
        successMsg: `Claimant changed to ${nameOf(value.userId)}`,
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: {
      onChange: changeClaimantFormSchema,
      onSubmit: changeClaimantFormSchema,
    },
  });
  const submitted = useFormSubmitted(form);
  const handleCancel = useEventCallback(() => onOpenChange(false));
  const getAccountId = useEventCallback(() =>
    form.getFieldValue("bankAccountId")
  );
  const setAccountId = useEventCallback((accountId: string | undefined) =>
    form.setFieldValue("bankAccountId", accountId)
  );
  const selectUserId = useEventCallback(
    (state: { values: ChangeClaimantValues }) => state.values.userId
  );

  return (
    <FormLayout className="flex flex-col gap-4" form={form}>
      <CustomField<string> isRequired label="New claimant" name="userId">
        {(field) => (
          <ClaimantCombobox
            id={field.name}
            invalid={fieldErrorProps(field, submitted)["aria-invalid"]}
            onBlur={field.handleBlur}
            onValueChange={field.handleChange}
            users={candidates}
            value={field.state.value}
          />
        )}
      </CustomField>
      <form.Subscribe selector={selectUserId}>
        {(userId: string) =>
          userId ? (
            <ClaimantBankAccountField
              claimantName={nameOf(userId)}
              getAccountId={getAccountId}
              setAccountId={setAccountId}
              key={userId}
              userId={userId}
            />
          ) : null
        }
      </form.Subscribe>
      <TextareaField
        description="Kept in the history and sent to both people."
        isRequired
        label="Reason"
        name="reason"
        placeholder="Why this belongs to someone else"
      />
      <FormActions
        cancelLabel="Cancel"
        onCancel={handleCancel}
        submitLabel="Change claimant"
        submittingLabel="Changing..."
      />
    </FormLayout>
  );
}

/**
 * Finance (`requests.create_for_others`) moves a reimbursement to the right
 * claimant, at any status, with a reason.
 */
export function ChangeClaimantDialog({
  onOpenChange,
  open,
  request,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  request: ChangeClaimantRequest;
}) {
  // A fresh form each time it opens.
  const [formKey, setFormKey] = useState(0);
  const handleOpenChange = useEventCallback((next: boolean) => {
    if (next) {
      setFormKey((k) => k + 1);
    }
    onOpenChange(next);
  });
  useEffect(() => {
    if (open) {
      setFormKey((k) => k + 1);
    }
  }, [open]);

  return (
    <FormModal
      description={
        request.status === "approved"
          ? "The new claimant owns this reimbursement and is paid to one of their saved accounts. Cash vouchers name the claimant, so they're made again."
          : "The new claimant owns this reimbursement and is paid to one of their saved accounts."
      }
      onOpenChange={handleOpenChange}
      open={open}
      size="md"
      title="Change claimant"
    >
      <ChangeClaimantForm
        key={formKey}
        onOpenChange={handleOpenChange}
        request={request}
      />
    </FormModal>
  );
}
