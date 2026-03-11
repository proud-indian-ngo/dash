import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Separator } from "@pi-dash/design-system/components/ui/separator";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";

const bankAccountSchema = z.object({
  accountName: z.string().min(1, "Account name is required"),
  accountNumber: z.string().min(1, "Account number is required"),
  ifscCode: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Invalid IFSC code"),
});

type BankAccountFormValues = z.infer<typeof bankAccountSchema>;

export function BankingSection() {
  const zero = useZero();
  const [accounts] = useQuery(queries.bankAccount.bankAccountsByCurrentUser());

  const form = useForm({
    defaultValues: {
      accountName: "",
      accountNumber: "",
      ifscCode: "",
    } satisfies BankAccountFormValues,
    onSubmit: async ({ value }) => {
      const res = await zero.mutate(
        mutators.bankAccount.create({
          id: uuidv7(),
          accountName: value.accountName,
          accountNumber: value.accountNumber,
          ifscCode: value.ifscCode,
        })
      ).server;
      if (res.type === "error") {
        toast.error("Failed to add bank account");
      } else {
        form.reset();
        toast.success("Bank account added");
      }
    },
    validators: {
      onBlur: bankAccountSchema,
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
        <InputField label="IFSC code" name="ifscCode" />
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
                        if (res.type === "error") {
                          toast.error("Failed to set default bank account");
                        }
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
                    onClick={async () => {
                      const res = await zero.mutate(
                        mutators.bankAccount.delete({ id: account.id })
                      ).server;
                      if (res.type === "error") {
                        toast.error("Failed to delete bank account");
                      }
                    }}
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
    </div>
  );
}
