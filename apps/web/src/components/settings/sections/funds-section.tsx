import {
  CheckmarkCircle02Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
  UnavailableIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type FundRestriction,
  type FundSource,
  fundRestrictionValues,
  fundSourceValues,
  GENERAL_FUND_ID,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Fund } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  SettingsCard,
  SettingsListItem,
} from "@/components/settings/settings-ui";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { reportMutationResult } from "@/lib/report-mutation-result";

const CODE_RE = /^[A-Z0-9_-]+$/i;

const RESTRICTION_LABELS: Record<FundRestriction, string> = {
  designated: "Designated",
  restricted: "Restricted",
  unrestricted: "Unrestricted",
};

const SOURCE_LABELS: Record<FundSource, string> = {
  domestic: "Domestic",
  fcra: "FCRA",
};

const restrictionOptions = fundRestrictionValues.map((value) => ({
  label: RESTRICTION_LABELS[value],
  value,
}));
const sourceOptions = fundSourceValues.map((value) => ({
  label: SOURCE_LABELS[value],
  value,
}));

const fundSchema = z.object({
  active: z.boolean(),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(16)
    .regex(CODE_RE, "Letters, digits, - or _ only"),
  description: z.string().trim().max(500),
  name: z.string().trim().min(1, "Name is required").max(120),
  restriction: z.enum(fundRestrictionValues),
  source: z.enum(fundSourceValues),
});

type FundFormValues = z.infer<typeof fundSchema>;

function FundForm({
  initialValues,
  isEdit,
  onCancel,
  onSubmit,
}: {
  initialValues: FundFormValues;
  isEdit: boolean;
  onCancel: () => void;
  onSubmit: (values: FundFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: fundSchema, onSubmit: fundSchema },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          description="As the books and the CA know it, for example Building Fund."
          isRequired
          label="Name"
          name="name"
        />
        <InputField
          description="Short upper-case code used in exports, for example BUILD."
          isRequired
          label="Code"
          name="code"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            description="Restricted money can only be spent as the donor or grant says."
            isRequired
            label="Restriction"
            name="restriction"
            options={restrictionOptions}
          />
          <SelectField
            isRequired
            label="Source"
            name="source"
            options={sourceOptions}
          />
        </div>
        <TextareaField label="Description" name="description" />
        {isEdit ? null : (
          <CheckboxField
            description="Untick to add it closed: it can't be picked until it is reactivated."
            label="Active"
            name="active"
          />
        )}
        <FormActions
          onCancel={onCancel}
          submitLabel="Save fund"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type InlineMode = { kind: "create" } | { fund: Fund; kind: "edit" };

function FundRow({
  fund,
  onEdit,
  onToggleActive,
}: {
  fund: Fund;
  onEdit: (fund: Fund) => void;
  onToggleActive: (fund: Fund) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(fund));
  const handleToggle = useEventCallback(() => onToggleActive(fund));
  const active = fund.active !== false;
  const isDefault = fund.id === GENERAL_FUND_ID;
  return (
    <SettingsListItem
      actions={
        <ResponsiveActionMenu
          actions={[
            {
              icon: PencilEdit01Icon,
              id: "edit",
              label: "Edit",
              onSelect: handleEdit,
            },
            active
              ? {
                  destructive: true,
                  // Income and imports fall back to the General Fund.
                  disabled: isDefault,
                  icon: UnavailableIcon,
                  id: "deactivate",
                  label: isDefault
                    ? "Deactivate (the default fund stays)"
                    : "Deactivate",
                  onSelect: handleToggle,
                }
              : {
                  icon: CheckmarkCircle02Icon,
                  id: "reactivate",
                  label: "Reactivate",
                  onSelect: handleToggle,
                },
          ]}
          title={fund.name}
          trigger={
            <Button
              aria-label={`Actions for ${fund.name}`}
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
      }
      detail={[
        fund.code,
        RESTRICTION_LABELS[fund.restriction as FundRestriction] ??
          fund.restriction,
        SOURCE_LABELS[fund.source as FundSource] ?? fund.source,
      ].join(" · ")}
    >
      <span className="inline-flex items-center gap-2">
        {fund.name}
        {active ? null : <Badge variant="outline">Inactive</Badge>}
      </span>
    </SettingsListItem>
  );
}

/**
 * Settings → Funds (`finance.manage`): the funds income is recorded into
 * and the books keep balances for. Never deleted; an inactive fund stays on
 * old records but is offered nowhere. The General Fund always stays active.
 */
export function FundsSection() {
  const zero = useZero();
  const [funds] = useQuery(queries.fund.all());
  const [inlineMode, setInlineMode] = useState<InlineMode | null>(null);

  const toMutatorArgs = (id: string, values: FundFormValues) => ({
    active: values.active,
    code: values.code.trim().toUpperCase(),
    description: values.description.trim() || null,
    id,
    name: values.name.trim(),
    restriction: values.restriction,
    source: values.source,
  });

  const handleCreate = useEventCallback(async (values: FundFormValues) => {
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.fund.create(toMutatorArgs(id, values))
    ).server;
    reportMutationResult(res, {
      entityId: id,
      errorMsg: "Couldn't add the fund",
      mutation: "fund.create",
      successMsg: "Fund added",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleUpdate = useEventCallback(async (values: FundFormValues) => {
    if (inlineMode?.kind !== "edit") {
      return;
    }
    const { fund } = inlineMode;
    const res = await zero.mutate(
      mutators.fund.update(
        toMutatorArgs(fund.id, { ...values, active: fund.active !== false })
      )
    ).server;
    reportMutationResult(res, {
      entityId: fund.id,
      errorMsg: "Couldn't save the fund",
      mutation: "fund.update",
      successMsg: "Fund saved",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleToggleActive = useEventCallback(async (fund: Fund) => {
    const active = fund.active === false;
    const res = await zero.mutate(
      mutators.fund.update({
        active,
        code: fund.code,
        id: fund.id,
        name: fund.name,
      })
    ).server;
    reportMutationResult(res, {
      entityId: fund.id,
      errorMsg: active
        ? "Couldn't reactivate the fund"
        : "Couldn't deactivate the fund",
      mutation: "fund.update",
      successMsg: active
        ? `${fund.name} reactivated`
        : `${fund.name} deactivated`,
    });
  });

  const openCreate = useEventCallback(() => setInlineMode({ kind: "create" }));
  const cancelInline = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((fund: Fund) =>
    setInlineMode({ fund, kind: "edit" })
  );

  return (
    <SettingsCard
      action={
        inlineMode ? null : (
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
            Add fund
          </Button>
        )
      }
      description="Funds income is recorded into and the books keep balances for. Inactive ones stay on old records but can't be picked. Funds are never deleted, and the General Fund stays active."
      title={`${funds.length} ${funds.length === 1 ? "fund" : "funds"}`}
    >
      {inlineMode?.kind === "create" ? (
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="mb-3 text-sm font-medium">New fund</h3>
          <FundForm
            initialValues={{
              active: true,
              code: "",
              description: "",
              name: "",
              restriction: "unrestricted",
              source: "domestic",
            }}
            isEdit={false}
            onCancel={cancelInline}
            onSubmit={handleCreate}
          />
        </div>
      ) : null}
      {funds.map((fund) =>
        inlineMode?.kind === "edit" && inlineMode.fund.id === fund.id ? (
          <div className="bg-muted/30 px-4 py-3" key={fund.id}>
            <h3 className="mb-3 text-sm font-medium">Edit fund</h3>
            <FundForm
              initialValues={{
                active: fund.active !== false,
                code: fund.code,
                description: fund.description ?? "",
                name: fund.name,
                restriction: fund.restriction as FundRestriction,
                source: fund.source as FundSource,
              }}
              isEdit
              key={`edit-${fund.id}`}
              onCancel={cancelInline}
              onSubmit={handleUpdate}
            />
          </div>
        ) : (
          <FundRow
            fund={fund}
            key={fund.id}
            onEdit={handleEditRequest}
            onToggleActive={handleToggleActive}
          />
        )
      )}
      {funds.length === 0 && !inlineMode ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          No funds yet.
        </p>
      ) : null}
    </SettingsCard>
  );
}
