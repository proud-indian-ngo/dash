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
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { CostCentre } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import {
  SettingsCard,
  SettingsListItem,
} from "@/components/settings/settings-ui";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import { reportMutationResult } from "@/lib/report-mutation-result";

const CODE_RE = /^[A-Z0-9_-]+$/i;

const costCentreSchema = z.object({
  active: z.boolean(),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(16)
    .regex(CODE_RE, "Letters, digits, - or _ only"),
  name: z.string().trim().min(1, "Name is required").max(120),
  stateUt: z.string().trim().max(60).optional(),
});

type CostCentreFormValues = z.infer<typeof costCentreSchema>;

function CostCentreForm({
  initialValues,
  isEdit,
  onCancel,
  onSubmit,
}: {
  initialValues: CostCentreFormValues;
  isEdit: boolean;
  onCancel: () => void;
  onSubmit: (values: CostCentreFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: costCentreSchema, onSubmit: costCentreSchema },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          description="What volunteers see as the city, for example Bangalore."
          isRequired
          label="Name"
          name="name"
        />
        <InputField
          description={
            isEdit
              ? "The code can't change: the website's events feed and the books use it."
              : "Short upper-case code the website's events feed uses, for example BLR. It can't change later."
          }
          disabled={isEdit}
          isRequired
          label="Code"
          name="code"
        />
        <InputField
          description="For FCRA location-wise reporting, for example Karnataka."
          label="State or union territory"
          name="stateUt"
        />
        {isEdit ? null : (
          <CheckboxField
            description="Untick to add it closed: it can't be picked until it is reactivated."
            label="Active"
            name="active"
          />
        )}
        <FormActions
          onCancel={onCancel}
          submitLabel="Save cost centre"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type InlineMode = { kind: "create" } | { centre: CostCentre; kind: "edit" };

function CostCentreRow({
  centre,
  isLastActive,
  onEdit,
  onToggleActive,
}: {
  centre: CostCentre;
  isLastActive: boolean;
  onEdit: (centre: CostCentre) => void;
  onToggleActive: (centre: CostCentre) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(centre));
  const handleToggle = useEventCallback(() => onToggleActive(centre));
  const active = centre.active !== false;
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
                  // The last active centre stays: events need a city.
                  disabled: isLastActive,
                  icon: UnavailableIcon,
                  id: "deactivate",
                  label: isLastActive
                    ? "Deactivate (the last active one stays)"
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
          title={centre.name}
          trigger={
            <Button
              aria-label={`Actions for ${centre.name}`}
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
      detail={[centre.code, centre.stateUt].filter(Boolean).join(" · ")}
    >
      <span className="inline-flex items-center gap-2">
        {centre.name}
        {active ? null : <Badge variant="outline">Inactive</Badge>}
      </span>
    </SettingsListItem>
  );
}

/**
 * Settings → Cost centres (`finance.manage`): where the work happens, which
 * volunteers see as "City". Never deleted; an inactive centre stays on old
 * records but is offered nowhere, and its events leave the public feed.
 */
export function CostCentresSection() {
  const zero = useZero();
  const [centres] = useQuery(queries.costCentre.all());
  const [inlineMode, setInlineMode] = useState<InlineMode | null>(null);

  const activeCount = centres.filter((c) => c.active !== false).length;

  const toMutatorArgs = (
    id: string,
    values: CostCentreFormValues,
    active: boolean
  ) => ({
    active,
    code: values.code.trim().toUpperCase(),
    id,
    name: values.name.trim(),
    stateUt: values.stateUt?.trim() || null,
  });

  const handleCreate = useEventCallback(
    async (values: CostCentreFormValues) => {
      const id = uuidv7();
      const res = await zero.mutate(
        mutators.costCentre.create(toMutatorArgs(id, values, values.active))
      ).server;
      reportMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't add the cost centre",
        mutation: "costCentre.create",
        successMsg: "Cost centre added",
      });
      if (res.type !== "error") {
        setInlineMode(null);
      }
    }
  );

  const handleUpdate = useEventCallback(
    async (values: CostCentreFormValues) => {
      if (inlineMode?.kind !== "edit") {
        return;
      }
      const { centre } = inlineMode;
      const res = await zero.mutate(
        mutators.costCentre.update(
          toMutatorArgs(
            centre.id,
            { ...values, code: centre.code },
            centre.active !== false
          )
        )
      ).server;
      reportMutationResult(res, {
        entityId: centre.id,
        errorMsg: "Couldn't save the cost centre",
        mutation: "costCentre.update",
        successMsg: "Cost centre saved",
      });
      if (res.type !== "error") {
        setInlineMode(null);
      }
    }
  );

  const handleToggleActive = useEventCallback(async (centre: CostCentre) => {
    const active = centre.active === false;
    const res = await zero.mutate(
      mutators.costCentre.update({
        active,
        code: centre.code,
        id: centre.id,
        name: centre.name,
        stateUt: centre.stateUt ?? null,
      })
    ).server;
    reportMutationResult(res, {
      entityId: centre.id,
      errorMsg: active
        ? "Couldn't reactivate the cost centre"
        : "Couldn't deactivate the cost centre",
      mutation: "costCentre.update",
      successMsg: active
        ? `${centre.name} reactivated`
        : `${centre.name} deactivated`,
    });
  });

  const openCreate = useEventCallback(() => setInlineMode({ kind: "create" }));
  const cancelInline = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((centre: CostCentre) =>
    setInlineMode({ centre, kind: "edit" })
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
            Add cost centre
          </Button>
        )
      }
      description="Volunteers see a cost centre as the city of an event or request. Inactive ones stay on old records but can't be picked, and their events leave the website. Cost centres are never deleted."
      title={`${centres.length} ${centres.length === 1 ? "cost centre" : "cost centres"}`}
    >
      {inlineMode?.kind === "create" ? (
        <div className="bg-muted/30 px-4 py-3">
          <h3 className="mb-3 text-sm font-medium">New cost centre</h3>
          <CostCentreForm
            initialValues={{ active: true, code: "", name: "", stateUt: "" }}
            isEdit={false}
            onCancel={cancelInline}
            onSubmit={handleCreate}
          />
        </div>
      ) : null}
      {centres.map((centre) =>
        inlineMode?.kind === "edit" && inlineMode.centre.id === centre.id ? (
          <div className="bg-muted/30 px-4 py-3" key={centre.id}>
            <h3 className="mb-3 text-sm font-medium">Edit cost centre</h3>
            <CostCentreForm
              initialValues={{
                active: centre.active !== false,
                code: centre.code,
                name: centre.name,
                stateUt: centre.stateUt ?? "",
              }}
              isEdit
              key={`edit-${centre.id}`}
              onCancel={cancelInline}
              onSubmit={handleUpdate}
            />
          </div>
        ) : (
          <CostCentreRow
            centre={centre}
            isLastActive={centre.active !== false && activeCount === 1}
            key={centre.id}
            onEdit={handleEditRequest}
            onToggleActive={handleToggleActive}
          />
        )
      )}
      {centres.length === 0 && !inlineMode ? (
        <p className="text-muted-foreground px-4 py-6 text-center text-sm">
          No cost centres yet.
        </p>
      ) : null}
    </SettingsCard>
  );
}
