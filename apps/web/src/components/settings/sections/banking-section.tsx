import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { payoutAccountDetail } from "@pi-dash/shared/payout-account";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { BankAccount } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import {
  SettingsCard,
  SettingsListItem,
} from "@/components/settings/settings-ui";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Tag } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { handleMutationResult } from "@/lib/mutation-result";

import {
  type BankAccountFormValues,
  createBankAccountSchema,
} from "./banking-schema";

function BankAccountListRow({
  account,
  canManage,
  onDelete,
  onSetDefault,
}: {
  account: BankAccount;
  canManage: boolean;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const handleSetDefault = useEventCallback(() => onSetDefault(account.id));
  const handleDelete = useEventCallback(() => onDelete(account.id));

  return (
    <SettingsListItem
      actions={
        canManage ? (
          <>
            {account.isDefault ? null : (
              <Button
                onClick={handleSetDefault}
                size="sm"
                type="button"
                variant="ghost"
              >
                Set default
              </Button>
            )}
            <Button
              aria-label="Delete account"
              onClick={handleDelete}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <HugeiconsIcon
                className="size-4"
                icon={Delete02Icon}
                strokeWidth={2}
              />
            </Button>
          </>
        ) : undefined
      }
      detail={
        <span className="font-mono tabular-nums">
          {payoutAccountDetail(account)}
        </span>
      }
    >
      <span className="flex items-center gap-2">
        {account.accountName}
        {account.isDefault ? <Tag>Default</Tag> : null}
      </span>
    </SettingsListItem>
  );
}

/** What the new account holds, for the toasts. */
function addedLabel(value: BankAccountFormValues): string {
  const bank = Boolean(value.accountNumber.trim());
  const upi = Boolean(value.upiId.trim());
  if (bank && upi) {
    return "Bank account and UPI";
  }
  return upi ? "UPI" : "Bank account";
}

export function BankingSection() {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canManage = hasPermission("bank_accounts.manage_own");
  const [accounts] = useQuery(queries.bankAccount.bankAccountsByCurrentUser());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const accountList = accounts ?? [];
  // Refuses a number or UPI ID already saved, before the server does.
  const schema = createBankAccountSchema(accountList);
  const form = useForm({
    defaultValues: {
      accountName: "",
      accountNumber: "",
      ifscCode: "",
      upiId: "",
    } satisfies BankAccountFormValues,
    onSubmit: async ({ value }) => {
      const id = uuidv7();
      const label = addedLabel(value);
      // The mutator normalises: IFSC upper-cased, UPI handles tidied.
      const res = await zero.mutate(
        mutators.bankAccount.create({
          accountName: value.accountName,
          accountNumber: value.accountNumber,
          id,
          ifscCode: value.ifscCode,
          upiId: value.upiId,
        })
      ).server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't add the account",
        mutation: "bankAccount.create",
        successMsg: `${label} added`,
      });
      if (res.type !== "error") {
        form.reset();
      }
    },
    validators: {
      onChange: schema,
      onSubmit: schema,
    },
  });

  const handleSetDefault = useEventCallback(async (id: string) => {
    const res = await zero.mutate(mutators.bankAccount.setDefault({ id }))
      .server;
    handleMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't set the default account",
      mutation: "bankAccount.setDefault",
      successMsg: "Default account set",
    });
  });
  const handleDeleteRequest = useEventCallback((id: string) =>
    setDeleteTarget(id)
  );
  const stableOnConfirm0 = useEventCallback(async () => {
    if (!deleteTarget) {
      return;
    }
    const res = await zero.mutate(
      mutators.bankAccount.delete({ id: deleteTarget })
    ).server;
    handleMutationResult(res, {
      entityId: deleteTarget,
      errorMsg: "Failed to delete account",
      mutation: "bankAccount.delete",
    });
    if (res.type !== "error") {
      setDeleteTarget(null);
    }
  });
  const stableOnOpenChange1 = useEventCallback((open: boolean) => {
    if (!open) {
      setDeleteTarget(null);
    }
  });

  return (
    <div className="flex flex-col gap-8">
      {accountList.length > 0 ? (
        <SettingsCard title="Your accounts">
          {accountList.map((account) => (
            <BankAccountListRow
              account={account}
              canManage={canManage}
              key={account.id}
              onDelete={handleDeleteRequest}
              onSetDefault={handleSetDefault}
            />
          ))}
        </SettingsCard>
      ) : (
        <p className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
          {canManage
            ? "No bank accounts or UPI yet. Add one below so reimbursements can be paid."
            : "No bank accounts or UPI yet."}
        </p>
      )}

      {canManage ? (
        <FormLayout className="flex max-w-md flex-col gap-4" form={form}>
          <h2 className="text-sm font-medium">Add a bank account or UPI</h2>
          <p className="text-muted-foreground -mt-2 text-sm">
            Add bank details, a UPI ID or number, or both. Finance pays by
            whichever suits them.
          </p>
          <InputField
            description="As on your bank account or UPI app"
            label="Account name"
            name="accountName"
          />
          <InputField
            autoComplete="off"
            inputMode="numeric"
            label="Account number"
            name="accountNumber"
          />
          <InputField
            autoCapitalize="characters"
            autoComplete="off"
            className="uppercase"
            label="IFSC code"
            name="ifscCode"
            placeholder="ABCD0123456"
          />
          <InputField
            description="A UPI ID, or the mobile number linked to UPI"
            label="UPI ID or mobile number"
            name="upiId"
            placeholder="name@okhdfc or 9876543210"
          />
          <FormActions submitLabel="Add account" submittingLabel="Adding..." />
        </FormLayout>
      ) : (
        <p className="text-muted-foreground text-sm">
          Your role can't add or change bank accounts. Ask an admin if you need
          to.
        </p>
      )}

      <ConfirmDialog
        confirmLabel="Delete account"
        description="This account will be permanently deleted. This cannot be undone."
        onConfirm={stableOnConfirm0}
        onOpenChange={stableOnOpenChange1}
        open={deleteTarget !== null}
        title="Delete account?"
      />
    </div>
  );
}
