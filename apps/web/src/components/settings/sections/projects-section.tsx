import { PencilEdit01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  type ProjectKind,
  projectKindValues,
  type ProjectStatus,
  projectStatusValues,
} from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Project } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  SettingsCard,
  SettingsListItem,
} from "@/components/settings/settings-ui";
import { DATE } from "@/lib/date-formats";
import {
  formatPaise,
  isValidRupeesInput,
  paiseToRupeesInput,
  rupeesToPaise,
} from "@/lib/paise";
import { reportMutationResult } from "@/lib/report-mutation-result";

const KIND_LABELS: Record<ProjectKind, string> = {
  class: "Class",
  drive: "Drive",
  edition: "Edition",
  engagement: "Corporate engagement",
  other: "Other",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  closed: "Closed",
  planned: "Planned",
};

const kindOptions = projectKindValues.map((value) => ({
  label: KIND_LABELS[value],
  value,
}));
const statusOptions = projectStatusValues.map((value) => ({
  label: STATUS_LABELS[value],
  value,
}));

const projectSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "Code is required")
      .max(16)
      .regex(/^[A-Z0-9_-]+$/i, "Letters, digits, - or _ only"),
    description: z.string().trim().max(500).optional(),
    endsOn: z.date().optional(),
    kind: z.enum(projectKindValues),
    name: z.string().trim().min(1, "Name is required").max(120),
    programmeId: z.string().min(1, "Programme is required"),
    quotedBudget: z
      .string()
      .refine(isValidRupeesInput, "Enter a rupee amount up to two decimals"),
    reportDueOn: z.date().optional(),
    startsOn: z.date().optional(),
    status: z.enum(projectStatusValues),
  })
  .refine((v) => !(v.startsOn && v.endsOn) || v.endsOn >= v.startsOn, {
    message: "End date must be on or after the start date",
    path: ["endsOn"],
  });

type ProjectFormValues = z.infer<typeof projectSchema>;

/** Zero holds `date` columns as UTC-midnight epochs; show them as local calendar days. */
function epochToLocalDate(value: number | null | undefined): Date | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const iso = new Date(value).toISOString().slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, d as number);
}

function dateToIso(value: Date | undefined): string | null {
  return value ? format(value, "yyyy-MM-dd") : null;
}

function ProjectForm({
  initialValues,
  onCancel,
  onSubmit,
  programmeOptions,
}: {
  initialValues: ProjectFormValues;
  onCancel: () => void;
  onSubmit: (values: ProjectFormValues) => void | Promise<void>;
  programmeOptions: { label: string; value: string }[];
}) {
  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
    validators: { onChange: projectSchema, onSubmit: projectSchema },
  });

  return (
    <FormLayout form={form}>
      <div className="flex flex-col gap-3 py-2">
        <InputField isRequired label="Name" name="name" />
        <div className="grid gap-3 sm:grid-cols-2">
          <InputField
            description="Short upper-case code used in exports."
            isRequired
            label="Code"
            name="code"
          />
          <SelectField
            isRequired
            label="Programme"
            name="programmeId"
            options={programmeOptions}
            placeholder="Select programme"
          />
          <SelectField
            isRequired
            label="Kind"
            name="kind"
            options={kindOptions}
          />
          <SelectField
            isRequired
            label="Status"
            name="status"
            options={statusOptions}
          />
          <DateField label="Starts on" name="startsOn" />
          <DateField label="Ends on" name="endsOn" />
          <InputField
            description="For engagements: the amount quoted to the sponsor."
            inputMode="decimal"
            label="Quoted budget (₹)"
            name="quotedBudget"
          />
          <DateField label="Report due on" name="reportDueOn" />
        </div>
        <TextareaField label="Description" name="description" />
        <FormActions
          onCancel={onCancel}
          submitLabel="Save project"
          submittingLabel="Saving..."
        />
      </div>
    </FormLayout>
  );
}

type InlineMode =
  | { kind: "create" }
  | { kind: "edit"; project: Project }
  | null;

function describeProject(project: Project, programmeName: string | undefined) {
  const parts = [project.code, programmeName ?? "Unknown programme"];
  const dates = [project.startsOn, project.endsOn]
    .map((d) => epochToLocalDate(d))
    .map((d) => (d ? format(d, DATE) : null));
  if (dates[0] || dates[1]) {
    parts.push(`${dates[0] ?? "…"} to ${dates[1] ?? "…"}`);
  }
  if (
    project.quotedBudgetPaise !== null &&
    project.quotedBudgetPaise !== undefined
  ) {
    parts.push(`Quoted ${formatPaise(project.quotedBudgetPaise)}`);
  }
  return parts.join(" · ");
}

function ProjectRow({
  onEdit,
  programmeName,
  project,
}: {
  onEdit: (project: Project) => void;
  programmeName: string | undefined;
  project: Project;
}) {
  const handleEdit = useEventCallback(() => onEdit(project));
  return (
    <SettingsListItem
      actions={
        <Button
          aria-label={`Edit ${project.name}`}
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
      detail={describeProject(project, programmeName)}
    >
      <span className="inline-flex items-center gap-2">
        {project.name}
        <Badge variant="outline">
          {KIND_LABELS[project.kind as ProjectKind]}
        </Badge>
        {project.status === "active" ? null : (
          <Badge variant="outline">
            {STATUS_LABELS[project.status as ProjectStatus]}
          </Badge>
        )}
      </span>
    </SettingsListItem>
  );
}

function toFormValues(project: Project): ProjectFormValues {
  return {
    code: project.code,
    description: project.description ?? "",
    endsOn: epochToLocalDate(project.endsOn),
    kind: project.kind as ProjectKind,
    name: project.name,
    programmeId: project.programmeId,
    quotedBudget: paiseToRupeesInput(project.quotedBudgetPaise),
    reportDueOn: epochToLocalDate(project.reportDueOn),
    startsOn: epochToLocalDate(project.startsOn),
    status: project.status as ProjectStatus,
  };
}

export function ProjectsSection() {
  const zero = useZero();
  const [projects] = useQuery(queries.project.all());
  const [programmes] = useQuery(queries.programme.all());
  const [inlineMode, setInlineMode] = useState<InlineMode>(null);

  const projectList = projects ?? [];
  const programmeNames = new Map((programmes ?? []).map((p) => [p.id, p.name]));
  const programmeOptions = (programmes ?? [])
    .filter((p) => p.active)
    .map((p) => ({ label: p.name, value: p.id }));

  const toMutatorArgs = (id: string, values: ProjectFormValues) => ({
    code: values.code.toUpperCase(),
    description: values.description?.trim() || null,
    endsOn: dateToIso(values.endsOn),
    id,
    kind: values.kind,
    name: values.name,
    programmeId: values.programmeId,
    quotedBudgetPaise: rupeesToPaise(values.quotedBudget),
    reportDueOn: dateToIso(values.reportDueOn),
    startsOn: dateToIso(values.startsOn),
    status: values.status,
  });

  const handleCreate = useEventCallback(async (values: ProjectFormValues) => {
    const id = uuidv7();
    const res = await zero.mutate(
      mutators.project.create(toMutatorArgs(id, values))
    ).server;
    reportMutationResult(res, {
      entityId: id,
      errorMsg: "Failed to create project",
      mutation: "project.create",
      successMsg: "Project created",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const handleUpdate = useEventCallback(async (values: ProjectFormValues) => {
    if (inlineMode?.kind !== "edit") {
      return;
    }
    const res = await zero.mutate(
      mutators.project.update(toMutatorArgs(inlineMode.project.id, values))
    ).server;
    reportMutationResult(res, {
      entityId: inlineMode.project.id,
      errorMsg: "Failed to update project",
      mutation: "project.update",
      successMsg: "Project updated",
    });
    if (res.type !== "error") {
      setInlineMode(null);
    }
  });

  const openCreate = useEventCallback(() => setInlineMode({ kind: "create" }));
  const cancelInline = useEventCallback(() => setInlineMode(null));
  const handleEditRequest = useEventCallback((project: Project) =>
    setInlineMode({ kind: "edit", project })
  );

  return (
    <div className="flex flex-col gap-4">
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
              Add project
            </Button>
          )
        }
        title={`${projectList.length} ${projectList.length === 1 ? "project" : "projects"}`}
      >
        {inlineMode?.kind === "create" ? (
          <div className="bg-muted/30 px-4 py-3">
            <h3 className="mb-3 text-sm font-medium">New project</h3>
            <ProjectForm
              initialValues={{
                code: "",
                description: "",
                kind: "other",
                name: "",
                programmeId: programmeOptions[0]?.value ?? "",
                quotedBudget: "",
                status: "active",
              }}
              onCancel={cancelInline}
              onSubmit={handleCreate}
              programmeOptions={programmeOptions}
            />
          </div>
        ) : null}
        {projectList.map((project) =>
          inlineMode?.kind === "edit" &&
          inlineMode.project.id === project.id ? (
            <div className="bg-muted/30 px-4 py-3" key={project.id}>
              <h3 className="mb-3 text-sm font-medium">Edit project</h3>
              <ProjectForm
                initialValues={toFormValues(project)}
                key={`edit-${project.id}`}
                onCancel={cancelInline}
                onSubmit={handleUpdate}
                programmeOptions={
                  programmeOptions.some((o) => o.value === project.programmeId)
                    ? programmeOptions
                    : [
                        ...programmeOptions,
                        {
                          label: `${programmeNames.get(project.programmeId) ?? "Current programme"} (inactive)`,
                          value: project.programmeId,
                        },
                      ]
                }
              />
            </div>
          ) : (
            <ProjectRow
              key={project.id}
              onEdit={handleEditRequest}
              programmeName={programmeNames.get(project.programmeId)}
              project={project}
            />
          )
        )}
        {projectList.length === 0 && !inlineMode ? (
          <p className="text-muted-foreground px-4 py-6 text-center text-sm">
            No projects yet. A project is a time-boxed piece of a programme: a
            class year, a Kalakriti edition, a drive or a corporate engagement.
          </p>
        ) : null}
      </SettingsCard>
    </div>
  );
}
