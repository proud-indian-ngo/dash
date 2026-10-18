import { PencilEdit01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  APP_CONFIG_FINANCE_THRESHOLD_KEY,
  DEFAULT_FINANCE_THRESHOLD_PAISE,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Programme } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { ComboboxField } from "@/components/form/combobox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { CashVoucherLimitCard } from "@/components/settings/sections/cash-voucher-limit-card";
import { VolunteerHourValueCard } from "@/components/settings/sections/volunteer-hour-value-card";
import {
  SettingsCard,
  SettingsListItem,
  SettingsRow,
} from "@/components/settings/settings-ui";
import {
  getProgrammeLeadCandidates,
  type PrivateUserCandidate,
} from "@/functions/users-for-picker";
import {
  formatPaiseCompact,
  isValidRupeesInput,
  paiseToRupeesInput,
  optionalRupeesToPaise,
} from "@/lib/paise";
import { reportMutationResult } from "@/lib/report-mutation-result";

const NO_LEAD = "__none__";

const rupees = z
  .string()
  .refine(isValidRupeesInput, "Enter a rupee amount up to two decimals");

const programmeSchema = z.object({
  active: z.boolean(),
  cause: z.string().trim().max(60).optional(),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(16)
    .regex(/^[A-Z0-9_-]+$/i, "Letters, digits, - or _ only"),
  description: z.string().trim().max(500).optional(),
  financeThreshold: rupees,
  leadUserId: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(120),
});

type ProgrammeFormValues = z.infer<typeof programmeSchema>;

const thresholdSchema = z.object({
  threshold: rupees.refine((v) => v.trim() !== "", "Enter an amount"),
});

function ProgrammeForm({
  initialValues,
  leadCandidatesState,
  leadOptions,
  onCancel,
  onSubmit,
}: {
  initialValues: ProgrammeFormValues;
  leadCandidatesState: "error" | "loading" | "ready";
  leadOptions: { label: string; value: string }[];
  onCancel: () => void;
  onSubmit: (values: ProgrammeFormValues) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: programmeSchema, onSubmit: programmeSchema },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField isRequired label="Name" name="name" />
        <InputField
          description="Short upper-case code used in exports, for example EDU."
          isRequired
          label="Code"
          name="code"
        />
        <TextareaField label="Description" name="description" />
        <InputField
          description="Short tag used in reports, for example education or arts."
          label="Cause"
          name="cause"
        />
        <ComboboxField
          description={
            leadCandidatesState === "loading"
              ? "Loading eligible people..."
              : leadCandidatesState === "error"
                ? "Programme leads could not be loaded. Close and reopen this form to retry."
                : undefined
          }
          disabled={leadCandidatesState !== "ready"}
          emptyMessage="No matching people."
          label="Programme lead"
          name="leadUserId"
          options={leadOptions}
          placeholder="Search by name"
        />
        <InputField
          description="Requests above this amount also need finance approval. Leave empty to use the default; 0 sends every request to finance."
          inputMode="decimal"
          label="Finance approval threshold (₹)"
          name="financeThreshold"
        />
        <CheckboxField
          description="Inactive programmes stay on old records but cannot be picked for new events. Programmes are never deleted."
          label="Active"
          name="active"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save programme"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

function DefaultThresholdForm({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: string;
  onCancel: () => void;
  onSubmit: (threshold: string) => void | Promise<void>;
}) {
  const form = useForm({
    defaultValues: { threshold: initialValue },
    onSubmit: async ({ value }) => {
      await onSubmit(value.threshold);
    },
    validators: { onChange: thresholdSchema, onSubmit: thresholdSchema },
  });
  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField
          inputMode="decimal"
          isRequired
          label="Default finance approval threshold (₹)"
          name="threshold"
        />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save threshold"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type InlineMode =
  | { kind: "create" }
  | { kind: "edit"; programme: Programme }
  | { kind: "threshold" }
  | null;

function leadLabel(
  leadUserId: string | null,
  leadName: string | undefined
): string {
  if (!leadUserId) {
    return "No lead";
  }
  return leadName ? `Lead: ${leadName}` : "Lead set (user not loaded)";
}

function ProgrammeRow({
  defaultThresholdPaise,
  leadName,
  onEdit,
  programme,
}: {
  defaultThresholdPaise: number;
  leadName: string | undefined;
  onEdit: (programme: Programme) => void;
  programme: Programme;
}) {
  const handleEdit = useEventCallback(() => onEdit(programme));
  const threshold = programme.financeThresholdPaise ?? defaultThresholdPaise;
  const detailParts = [
    programme.code,
    leadLabel(programme.leadUserId, leadName),
    `Finance above ${formatPaiseCompact(threshold)}${programme.financeThresholdPaise === null ? " (default)" : ""}`,
  ];

  return (
    <SettingsListItem
      actions={
        <Button
          aria-label={`Edit ${programme.name}`}
          onClick={handleEdit}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <HugeiconsIcon
            className="size-4"
            icon={PencilEdit01Icon}
            strokeWidth={2}
          />
        </Button>
      }
      detail={detailParts.join(" · ")}
    >
      <span className="inline-flex items-center gap-2">
        {programme.name}
        {programme.active ? null : <Badge variant="outline">Inactive</Badge>}
      </span>
    </SettingsListItem>
  );
}

export function ProgrammesSection() {
  const zero = useZero();
  const [programmes] = useQuery(queries.programme.all());
  const [configs] = useQuery(queries.appConfig.all());
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);
  const [leadCandidates, setLeadCandidates] = useState<{
    state: "error" | "loading" | "ready";
    users: PrivateUserCandidate[];
  }>({ state: "loading", users: [] });

  const candidateLoadKey =
    inlineMode?.kind === "create"
      ? "create"
      : inlineMode?.kind === "edit"
        ? `edit:${inlineMode.programme.id}`
        : null;

  useEffect(() => {
    if (!candidateLoadKey) return;

    let active = true;
    getProgrammeLeadCandidates()
      .then((users) => {
        if (active) setLeadCandidates({ state: "ready", users });
      })
      .catch((error) => {
        if (!active) return;
        log.error({
          action: "loadProgrammeLeadCandidates",
          component: "ProgrammesSection",
          error: error instanceof Error ? error.message : String(error),
        });
        setLeadCandidates({ state: "error", users: [] });
      });

    return () => {
      active = false;
    };
  }, [candidateLoadKey]);

  const programmeList = programmes ?? [];
  const configured = configs?.find(
    (c) => c.key === APP_CONFIG_FINANCE_THRESHOLD_KEY
  )?.value;
  const parsedDefault = configured ? Number(configured) : Number.NaN;
  const defaultThresholdPaise = Number.isFinite(parsedDefault)
    ? parsedDefault
    : DEFAULT_FINANCE_THRESHOLD_PAISE;
  const userNames = new Map(leadCandidates.users.map((u) => [u.id, u.name]));
  const leadOptions = [
    { label: "No lead", value: NO_LEAD },
    ...leadCandidates.users.map((u) => ({ label: u.name, value: u.id })),
  ];

  const toMutatorArgs = (id: string, values: ProgrammeFormValues) => ({
    active: values.active,
    cause: values.cause?.trim() || null,
    code: values.code.toUpperCase(),
    description: values.description?.trim() || null,
    financeThresholdPaise: optionalRupeesToPaise(values.financeThreshold),
    id,
    leadUserId:
      values.leadUserId && values.leadUserId !== NO_LEAD
        ? values.leadUserId
        : null,
    name: values.name,
  });

  const handleCreate = useEventCallback(async (values: ProgrammeFormValues) => {
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.programme.create({
        ...toMutatorArgs(id, values),
        sortOrder: (programmeList.length + 1) * 10,
      })
    ).server;
    reportMutationResult(res, {
      entityId: id,
      errorMsg: "Failed to create programme",
      mutation: "programme.create",
      successMsg: "Programme created",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleUpdate = useEventCallback(async (values: ProgrammeFormValues) => {
    if (inlineMode?.kind !== "edit") {
      return;
    }
    const res = await zero.mutate(
      mutators.programme.update({
        ...toMutatorArgs(inlineMode.programme.id, values),
        sortOrder: inlineMode.programme.sortOrder ?? 0,
      })
    ).server;
    reportMutationResult(res, {
      entityId: inlineMode.programme.id,
      errorMsg: "Failed to update programme",
      mutation: "programme.update",
      successMsg: "Programme updated",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleThreshold = useEventCallback(async (threshold: string) => {
    const paise =
      optionalRupeesToPaise(threshold) ?? DEFAULT_FINANCE_THRESHOLD_PAISE;
    const res = await zero.mutate(
      mutators.appConfig.upsert({
        key: APP_CONFIG_FINANCE_THRESHOLD_KEY,
        value: String(paise),
      })
    ).server;
    reportMutationResult(res, {
      entityId: APP_CONFIG_FINANCE_THRESHOLD_KEY,
      errorMsg: "Failed to update default threshold",
      mutation: "appConfig.upsert",
      successMsg: "Default threshold updated",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const openCreate = useEventCallback(() => {
    setLeadCandidates({ state: "loading", users: [] });
    setInlineMode({ kind: "create" });
  });
  const openThreshold = useEventCallback(() =>
    setInlineMode({ kind: "threshold" })
  );
  const cancelInline = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((programme: Programme) => {
    setLeadCandidates({ state: "loading", users: [] });
    setInlineMode({ kind: "edit", programme });
  });

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Approval threshold">
        {inlineMode?.kind === "threshold" ? (
          <div className="bg-muted/30 px-4 py-3">
            <DefaultThresholdForm
              initialValue={paiseToRupeesInput(defaultThresholdPaise)}
              onCancel={cancelInline}
              onSubmit={handleThreshold}
            />
          </div>
        ) : (
          <SettingsRow
            description="Requests above this amount need finance approval after the programme lead, unless the programme sets its own threshold."
            title={`Default: ${formatPaiseCompact(defaultThresholdPaise)}`}
          >
            <Button
              aria-label="Edit default threshold"
              onClick={openThreshold}
              size="sm"
              type="button"
              variant="outline"
            >
              Edit
            </Button>
          </SettingsRow>
        )}
      </SettingsCard>

      <VolunteerHourValueCard />

      <CashVoucherLimitCard />

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
              Add programme
            </Button>
          )
        }
        title={`${programmeList.length} ${programmeList.length === 1 ? "programme" : "programmes"}`}
      >
        {inlineMode?.kind === "create" ? (
          <div className="bg-muted/30 px-4 py-3">
            <h3 className="mb-3 text-sm font-medium">New programme</h3>
            <ProgrammeForm
              initialValues={{
                active: true,
                code: "",
                description: "",
                financeThreshold: "",
                leadUserId: NO_LEAD,
                name: "",
              }}
              leadCandidatesState={leadCandidates.state}
              leadOptions={leadOptions}
              onCancel={cancelInline}
              onSubmit={handleCreate}
            />
          </div>
        ) : null}
        {programmeList.map((programme) =>
          inlineMode?.kind === "edit" &&
          inlineMode.programme.id === programme.id ? (
            <div className="bg-muted/30 px-4 py-3" key={programme.id}>
              <h3 className="mb-3 text-sm font-medium">Edit programme</h3>
              <ProgrammeForm
                initialValues={{
                  active: programme.active ?? true,
                  cause: programme.cause ?? "",
                  code: programme.code,
                  description: programme.description ?? "",
                  financeThreshold: paiseToRupeesInput(
                    programme.financeThresholdPaise
                  ),
                  leadUserId: programme.leadUserId ?? NO_LEAD,
                  name: programme.name,
                }}
                key={`edit-${programme.id}`}
                leadCandidatesState={leadCandidates.state}
                leadOptions={leadOptions}
                onCancel={cancelInline}
                onSubmit={handleUpdate}
              />
            </div>
          ) : (
            <ProgrammeRow
              defaultThresholdPaise={defaultThresholdPaise}
              key={programme.id}
              leadName={
                programme.leadUserId
                  ? userNames.get(programme.leadUserId)
                  : undefined
              }
              onEdit={handleEditRequest}
              programme={programme}
            />
          )
        )}
        {programmeList.length === 0 && !inlineMode ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No programmes yet.
          </p>
        ) : null}
      </SettingsCard>
    </div>
  );
}
