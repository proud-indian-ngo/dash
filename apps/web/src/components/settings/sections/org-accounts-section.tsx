import {
  BankIcon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type FcraRole,
  fcraRoleValues,
  type FundSource,
  fundSourceValues,
  type OrgAccountKind,
  orgAccountKindValues,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { OrgAccount } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import {
  SettingsCard,
  SettingsListItem,
} from "@/components/settings/settings-ui";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { useApp } from "@/context/app-context";
import { reportMutationResult } from "@/lib/report-mutation-result";

const KIND_LABELS: Record<OrgAccountKind, string> = {
  bank: "Bank",
  cash: "Cash",
  deposit: "Fixed deposit",
  gateway_clearing: "Gateway clearing",
};

const FUND_SOURCE_LABELS: Record<FundSource, string> = {
  domestic: "Domestic",
  fcra: "FCRA",
};

const FCRA_ROLE_LABELS: Record<FcraRole, string> = {
  none: "None",
  receipt: "FCRA receipt",
  utilisation: "FCRA utilisation",
};

const kindOptions = orgAccountKindValues.map((value) => ({
  label: KIND_LABELS[value],
  value,
}));
const fundSourceOptions = fundSourceValues.map((value) => ({
  label: FUND_SOURCE_LABELS[value],
  value,
}));
const fcraRoleOptions = fcraRoleValues.map((value) => ({
  label: FCRA_ROLE_LABELS[value],
  value,
}));

const orgAccountSchema = z.object({
  active: z.boolean(),
  fcraRole: z.enum(fcraRoleValues),
  fundSource: z.enum(fundSourceValues),
  kind: z.enum(orgAccountKindValues, "Pick a kind"),
  name: z.string().trim().min(1, "Name is required").max(120),
});

type OrgAccountFormValues = z.infer<typeof orgAccountSchema>;

function OrgAccountForm({
  initialValues,
  onCancel,
  onSubmit,
}: {
  initialValues: OrgAccountFormValues;
  onCancel: () => void;
  onSubmit: (values: OrgAccountFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: orgAccountSchema, onSubmit: orgAccountSchema },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          description="As the treasurer knows it, for example HDFC current account."
          isRequired
          label="Name"
          name="name"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            isRequired
            label="Kind"
            name="kind"
            options={kindOptions}
          />
          <SelectField
            isRequired
            label="Fund source"
            name="fundSource"
            options={fundSourceOptions}
          />
        </div>
        <form.Subscribe selector={(state) => state.values.fundSource}>
          {(fundSource) =>
            fundSource === "fcra" ? (
              <SelectField
                description="The FCRA receipt account takes foreign money in; utilisation accounts spend it."
                isRequired
                label="FCRA role"
                name="fcraRole"
                options={fcraRoleOptions}
              />
            ) : null
          }
        </form.Subscribe>
        <CheckboxField
          description="Inactive accounts stay on old records but cannot be picked for new income. Accounts are never deleted."
          label="Active"
          name="active"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save account"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type InlineMode =
  | { kind: "create" }
  | { account: OrgAccount; kind: "edit" }
  | null;

function accountDetail(account: OrgAccount): string {
  const parts = [
    KIND_LABELS[account.kind as OrgAccountKind] ?? account.kind,
    FUND_SOURCE_LABELS[account.fundSource as FundSource] ?? account.fundSource,
  ];
  if (account.fundSource === "fcra" && account.fcraRole !== "none") {
    parts.push(
      FCRA_ROLE_LABELS[account.fcraRole as FcraRole] ?? account.fcraRole
    );
  }
  return parts.join(" · ");
}

function OrgAccountRow({
  account,
  canManage,
  onEdit,
}: {
  account: OrgAccount;
  canManage: boolean;
  onEdit: (account: OrgAccount) => void;
}) {
  const navigate = useNavigate();
  const handleEdit = useEventCallback(() => onEdit(account));
  const openStatements = useEventCallback(() =>
    navigate({ search: { account: account.id }, to: "/income/bank" })
  );
  const isBank = account.kind === "bank";
  return (
    <SettingsListItem
      actions={
        canManage || isBank ? (
          <ResponsiveActionMenu
            actions={[
              canManage && {
                icon: PencilEdit01Icon,
                id: "edit",
                label: "Edit",
                onSelect: handleEdit,
              },
              isBank && {
                icon: BankIcon,
                id: "bank-statements",
                label: "Bank statements",
                onSelect: openStatements,
              },
            ]}
            title={account.name}
            trigger={
              <Button
                aria-label={`Actions for ${account.name}`}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <HugeiconsIcon
                  className="size-4"
                  icon={MoreHorizontalIcon}
                  strokeWidth={2}
                />
              </Button>
            }
          />
        ) : null
      }
      detail={accountDetail(account)}
    >
      <span className="inline-flex items-center gap-2">
        {account.name}
        {account.active ? null : <Badge variant="outline">Inactive</Badge>}
      </span>
    </SettingsListItem>
  );
}

function toMutatorArgs(id: string, values: OrgAccountFormValues) {
  return {
    active: values.active,
    fcraRole: values.fundSource === "fcra" ? values.fcraRole : "none",
    fundSource: values.fundSource,
    id,
    kind: values.kind,
    name: values.name.trim(),
  };
}

export function OrgAccountsSection() {
  const zero = useZero();
  const { hasPermission } = useApp();
  const canManage = hasPermission("finance.manage");
  const [accounts] = useQuery(queries.orgAccount.all());
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);

  const handleCreate = useEventCallback(
    async (values: OrgAccountFormValues) => {
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.orgAccount.create(toMutatorArgs(id, values))
      ).server;
      reportMutationResult(res, {
        entityId: id,
        errorMsg: "Failed to create account",
        mutation: "orgAccount.create",
        successMsg: "Account created",
      });
      if (res.type !== "error") {
        setInlineMode(null);
      }
    }
  );

  const handleUpdate = useEventCallback(
    async (values: OrgAccountFormValues) => {
      if (inlineMode?.kind !== "edit") {
        return;
      }
      const res = await zero.mutate(
        mutators.orgAccount.update(toMutatorArgs(inlineMode.account.id, values))
      ).server;
      reportMutationResult(res, {
        entityId: inlineMode.account.id,
        errorMsg: "Failed to update account",
        mutation: "orgAccount.update",
        successMsg: "Account updated",
      });
      if (res.type !== "error") {
        setInlineMode(null);
      }
    }
  );

  const openCreate = useEventCallback(() => setInlineMode({ kind: "create" }));
  const cancelInline = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((account: OrgAccount) =>
    setInlineMode({ account, kind: "edit" })
  );

  return (
    <SettingsCard
      action={
        canManage && !inlineMode ? (
          <Button
            onClick={openCreate}
            size="sm"
            type="button"
            variant="outline"
          >
            <HugeiconsIcon
              className="size-3.5"
              icon={PlusSignIcon}
              strokeWidth={2}
            />
            Add account
          </Button>
        ) : null
      }
      title={`${accounts.length} ${accounts.length === 1 ? "account" : "accounts"}`}
    >
      {inlineMode?.kind === "create" ? (
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="mb-3 text-sm font-medium">New account</h3>
          <OrgAccountForm
            initialValues={{
              active: true,
              fcraRole: "none",
              fundSource: "domestic",
              kind: "bank",
              name: "",
            }}
            onCancel={cancelInline}
            onSubmit={handleCreate}
          />
        </div>
      ) : null}
      {accounts.map((account) =>
        inlineMode?.kind === "edit" && inlineMode.account.id === account.id ? (
          <div className="bg-muted/30 px-4 py-3" key={account.id}>
            <h3 className="mb-3 text-sm font-medium">Edit account</h3>
            <OrgAccountForm
              initialValues={{
                active: account.active ?? true,
                fcraRole: account.fcraRole as FcraRole,
                fundSource: account.fundSource as FundSource,
                kind: account.kind as OrgAccountKind,
                name: account.name,
              }}
              key={`edit-${account.id}`}
              onCancel={cancelInline}
              onSubmit={handleUpdate}
            />
          </div>
        ) : (
          <OrgAccountRow
            account={account}
            canManage={canManage}
            key={account.id}
            onEdit={handleEditRequest}
          />
        )
      )}
      {accounts.length === 0 && !inlineMode ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          No accounts yet. Add the bank, cash and gateway accounts income is
          deposited into.
        </p>
      ) : null}
    </SettingsCard>
  );
}
