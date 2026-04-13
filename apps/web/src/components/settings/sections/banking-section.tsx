import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { handleMutationResult } from "@/lib/mutation-result";
import {
  type BankAccountFormValues,
  bankAccountSchema,
} from "./banking-schema";

export function BankingSection() {
  const zero = useZero();
  const [accounts] = useQuery(queries.bankAccount.bankAccountsByCurrentUser());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const form = useForm({
    defaultValues: {
      accountName: "",
      accountNumber: "",
      ifscCode: "",
    } satisfies BankAccountFormValues,
    onSubmit: async ({ value }) => {
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.bankAccount.create({
          id,
          accountName: value.accountName,
          accountNumber: value.accountNumber,
          ifscCode: value.ifscCode.toUpperCase(),
        })
      ).server;
      handleMutationResult(res, {
        mutation: "bankAccount.create",
        entityId: id,
        successMsg: "Bank account added",
        errorMsg: "Couldn't add bank account",
      });
      if (res.type !== "error") {
        form.reset();
      }
    },
    validators: {
      onChange: bankAccountSchema,
      onSubmit: bankAccountSchema,
    },
  });

  const accountList = accounts ?? [];

  return (
    <div className="flex flex-col gap-4 p-4">
      <FormLayout className="flex flex-col gap-3" form={form}>
        <p className="font-medium text-xs">Add bank account</p>
        <InputField label="Account name" name="accountName" />
        <InputField label="Account number" name="accountNumber" />
        <InputField
          className="uppercase"
          label="IFSC code"
          name="ifscCode"
          placeholder="ABCD0123456"
        />
        <div className="flex justify-end">
          <FormActions submitLabel="Add account" submittingLabel="Adding..." />
        </div>
      </FormLayout>

      {accountList.length > 0 ? (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            {accountList.map((account) => (
              <div
                className="flex items-start justify-between rounded-md border p-3"
                key={account.id}
              >
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {account.accountName}
                    </span>
                    {account.isDefault ? (
                      <Badge variant="secondary">Default</Badge>
                    ) : null}
                  </div>
                  <span className="text-muted-foreground text-xs">
                    ••••{account.accountNumber.slice(-4)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {account.ifscCode}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {account.isDefault ? null : (
                    <Button
                      onClick={async () => {
                        const res = await zero.mutate(
                          mutators.bankAccount.setDefault({ id: account.id })
                        ).server;
                        handleMutationResult(res, {
                          mutation: "bankAccount.setDefault",
                          entityId: account.id,
                          errorMsg: "Couldn't set default bank account",
                        });
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Set default
                    </Button>
                  )}
                  <Button
                    aria-label="Delete account"
                    onClick={() => setDeleteTarget(account.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <HugeiconsIcon
                      className="size-4"
                      icon={Delete02Icon}
                      strokeWidth={2}
                    />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-center text-muted-foreground text-xs">
          No bank accounts added yet.
        </p>
      )}

      <ConfirmDialog
        confirmLabel="Delete"
        description="This bank account will be permanently deleted. This cannot be undone."
        onConfirm={async () => {
          if (!deleteTarget) {
            return;
          }
          const res = await zero.mutate(
            mutators.bankAccount.delete({ id: deleteTarget })
          ).server;
          handleMutationResult(res, {
            mutation: "bankAccount.delete",
            entityId: deleteTarget,
            errorMsg: "Failed to delete bank account",
          });
          if (res.type !== "error") {
            setDeleteTarget(null);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        open={deleteTarget !== null}
        title="Delete bank account?"
      />
    </div>
  );
}
