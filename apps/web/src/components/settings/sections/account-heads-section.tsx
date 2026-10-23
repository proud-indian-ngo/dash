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
  type AccountHeadType,
  accountHeadTypeValues,
  LEDGER_ACCOUNT_HEAD_IDS,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { AccountHead } from "@pi-dash/zero/schema";
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
const NO_PARENT = "none";

const TYPE_LABELS: Record<AccountHeadType, string> = {
  asset: "Asset",
  expense: "Expense",
  fund: "Fund",
  income: "Income",
  liability: "Liability",
};

const typeOptions = accountHeadTypeValues.map((value) => ({
  label: TYPE_LABELS[value],
  value,
}));

const REFERENCE_HEAD_IDS = new Set<string>(
  Object.values(LEDGER_ACCOUNT_HEAD_IDS)
);

const accountHeadSchema = z.object({
  active: z.boolean(),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(16)
    .regex(CODE_RE, "Letters, digits, - or _ only"),
  description: z.string().trim().max(500),
  name: z.string().trim().min(1, "Name is required").max(120),
  parentId: z.string(),
  sortOrder: z
    .string()
    .trim()
    .regex(/^(-?\d+)?$/, "A whole number"),
  tallyLedgerName: z.string().trim().max(120),
  type: z.enum(accountHeadTypeValues),
});

type AccountHeadFormValues = z.infer<typeof accountHeadSchema>;

/** The head and every head under it: none of them can become its parent. */
function selfAndDescendants(
  heads: readonly AccountHead[],
  selfId: string | null
): Set<string> {
  const excluded = new Set<string>(selfId ? [selfId] : []);
  let grew = excluded.size > 0;
  while (grew) {
    grew = false;
    for (const h of heads) {
      if (h.parentId && excluded.has(h.parentId) && !excluded.has(h.id)) {
        excluded.add(h.id);
        grew = true;
      }
    }
  }
  return excluded;
}

function AccountHeadForm({
  heads,
  initialValues,
  isEdit,
  onCancel,
  onSubmit,
  selfId,
}: {
  heads: readonly AccountHead[];
  initialValues: AccountHeadFormValues;
  isEdit: boolean;
  onCancel: () => void;
  onSubmit: (values: AccountHeadFormValues) => void | Promise<void>;
  selfId: string | null;
}) {
  const form = useForm({
    defaultValues: initialValues,
    listeners: {
      onChange: ({ fieldApi, formApi }) => {
        // A parent of the old type no longer fits.
        if (fieldApi.name === "type") {
          formApi.setFieldValue("parentId", NO_PARENT);
        }
      },
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: accountHeadSchema, onSubmit: accountHeadSchema },
  });
  const notParents = selfAndDescendants(heads, selfId);

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          description="As the CA workbook shows it, for example Rent."
          isRequired
          label="Name"
          name="name"
        />
        <InputField
          description="Short upper-case code, for example EXPENSE_RENT."
          isRequired
          label="Code"
          name="code"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            description="A head with entries or sub-heads keeps its type."
            isRequired
            label="Type"
            name="type"
            options={typeOptions}
          />
          <form.Subscribe selector={(state) => state.values.type}>
            {(type) => (
              <SelectField
                description="Parents group heads of the same type."
                label="Parent"
                name="parentId"
                options={[
                  { label: "None", value: NO_PARENT },
                  ...heads
                    .filter((h) => h.type === type && !notParents.has(h.id))
                    .map((h) => ({ label: h.name, value: h.id })),
                ]}
              />
            )}
          </form.Subscribe>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            description="The ledger the CA uses in Tally, if it differs."
            label="Tally ledger name"
            name="tallyLedgerName"
          />
          <InputField
            description="Lower comes first."
            inputMode="numeric"
            label="Sort order"
            name="sortOrder"
          />
        </div>
        <TextareaField label="Description" name="description" />
        {isEdit ? null : (
          <CheckboxField
            description="Untick to add it closed: nothing posts under it until it is reactivated."
            label="Active"
            name="active"
          />
        )}
        <FormActions
          onCancel={onCancel}
          submitLabel="Save account head"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type InlineMode = { kind: "create" } | { head: AccountHead; kind: "edit" };

function AccountHeadRow({
  head,
  onEdit,
  onToggleActive,
  parentName,
}: {
  head: AccountHead;
  onEdit: (head: AccountHead) => void;
  onToggleActive: (head: AccountHead) => void;
  parentName: string | null;
}) {
  const handleEdit = useEventCallback(() => onEdit(head));
  const handleToggle = useEventCallback(() => onToggleActive(head));
  const active = head.active !== false;
  const isReference = REFERENCE_HEAD_IDS.has(head.id);
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
                  // The server also refuses any head with entries.
                  disabled: isReference,
                  icon: UnavailableIcon,
                  id: "deactivate",
                  label: isReference
                    ? "Deactivate (the books use it)"
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
          title={head.name}
          trigger={
            <Button
              aria-label={`Actions for ${head.name}`}
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
        head.code,
        TYPE_LABELS[head.type as AccountHeadType] ?? head.type,
        parentName ? `under ${parentName}` : null,
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      <span className="inline-flex items-center gap-2">
        {head.name}
        {active ? null : <Badge variant="outline">Inactive</Badge>}
      </span>
    </SettingsListItem>
  );
}

/**
 * Settings → Account heads (`finance.manage`): the heads the books post
 * recognition entries under. Never deleted. A reference head or one with
 * entries keeps its type and stays active; the mutator enforces it.
 */
export function AccountHeadsSection() {
  const zero = useZero();
  const [heads] = useQuery(queries.accountHead.all());
  const [inlineMode, setInlineMode] = useState<InlineMode | null>(null);
  const namesById = new Map(heads.map((h) => [h.id, h.name]));

  const toMutatorArgs = (id: string, values: AccountHeadFormValues) => ({
    active: values.active,
    code: values.code.trim().toUpperCase(),
    description: values.description.trim() || null,
    id,
    name: values.name.trim(),
    parentId: values.parentId === NO_PARENT ? null : values.parentId,
    sortOrder: values.sortOrder ? Number(values.sortOrder) : 0,
    tallyLedgerName: values.tallyLedgerName.trim() || null,
    type: values.type,
  });

  const handleCreate = useEventCallback(
    async (values: AccountHeadFormValues) => {
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.accountHead.create(toMutatorArgs(id, values))
      ).server;
      reportMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't add the account head",
        mutation: "accountHead.create",
        successMsg: "Account head added",
      });
      if (res.type !== "error") {
        setInlineMode(null);
      }
    }
  );

  const handleUpdate = useEventCallback(
    async (values: AccountHeadFormValues) => {
      if (inlineMode?.kind !== "edit") {
        return;
      }
      const { head } = inlineMode;
      const res = await zero.mutate(
        mutators.accountHead.update(
          toMutatorArgs(head.id, { ...values, active: head.active !== false })
        )
      ).server;
      reportMutationResult(res, {
        entityId: head.id,
        errorMsg: "Couldn't save the account head",
        mutation: "accountHead.update",
        successMsg: "Account head saved",
      });
      if (res.type !== "error") {
        setInlineMode(null);
      }
    }
  );

  const handleToggleActive = useEventCallback(async (head: AccountHead) => {
    const active = head.active === false;
    const res = await zero.mutate(
      mutators.accountHead.update({
        active,
        code: head.code,
        id: head.id,
        name: head.name,
        type: head.type as AccountHeadType,
      })
    ).server;
    reportMutationResult(res, {
      entityId: head.id,
      errorMsg: active
        ? "Couldn't reactivate the account head"
        : "Couldn't deactivate the account head",
      mutation: "accountHead.update",
      successMsg: active
        ? `${head.name} reactivated`
        : `${head.name} deactivated`,
    });
  });

  const openCreate = useEventCallback(() => setInlineMode({ kind: "create" }));
  const cancelInline = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((head: AccountHead) =>
    setInlineMode({ head, kind: "edit" })
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
            Add account head
          </Button>
        )
      }
      description="The heads the books post income, expenses, assets, liabilities and funds under. A head the books use keeps its type and stays active. Heads are never deleted."
      title={`${heads.length} ${heads.length === 1 ? "account head" : "account heads"}`}
    >
      {inlineMode?.kind === "create" ? (
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="mb-3 text-sm font-medium">New account head</h3>
          <AccountHeadForm
            heads={heads}
            initialValues={{
              active: true,
              code: "",
              description: "",
              name: "",
              parentId: NO_PARENT,
              sortOrder: "",
              tallyLedgerName: "",
              type: "expense",
            }}
            isEdit={false}
            onCancel={cancelInline}
            onSubmit={handleCreate}
            selfId={null}
          />
        </div>
      ) : null}
      {heads.map((head) =>
        inlineMode?.kind === "edit" && inlineMode.head.id === head.id ? (
          <div className="bg-muted/30 px-4 py-3" key={head.id}>
            <h3 className="mb-3 text-sm font-medium">Edit account head</h3>
            <AccountHeadForm
              heads={heads}
              initialValues={{
                active: head.active !== false,
                code: head.code,
                description: head.description ?? "",
                name: head.name,
                parentId: head.parentId ?? NO_PARENT,
                sortOrder: String(head.sortOrder ?? 0),
                tallyLedgerName: head.tallyLedgerName ?? "",
                type: head.type as AccountHeadType,
              }}
              isEdit
              key={`edit-${head.id}`}
              onCancel={cancelInline}
              onSubmit={handleUpdate}
              selfId={head.id}
            />
          </div>
        ) : (
          <AccountHeadRow
            head={head}
            key={head.id}
            onEdit={handleEditRequest}
            onToggleActive={handleToggleActive}
            parentName={
              head.parentId ? (namesById.get(head.parentId) ?? null) : null
            }
          />
        )
      )}
      {heads.length === 0 && !inlineMode ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          No account heads yet.
        </p>
      ) : null}
    </SettingsCard>
  );
}
