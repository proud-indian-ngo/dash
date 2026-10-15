import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CONTRIBUTION_CHANNEL_LABELS } from "@pi-dash/shared/income";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { reviewContributionImport } from "@/functions/income-import";
import {
  checkMapping,
  compareHeaders,
  DATE_FORMAT_LABELS,
  DATE_FORMAT_VALUES,
  IGNORE_FIELD,
  IMPORT_CHANNEL_VALUES,
  IMPORT_FIELD_KEYS,
  IMPORT_FIELD_LABELS,
  type ImportChannel,
  type ImportDateFormat,
  type ImportMapping,
  type ImportMappingTarget,
  mappingProblem,
  REQUIRED_IMPORT_FIELDS,
  sourceRules,
  WEAK_IDENTITY_WARNING,
} from "@/lib/income-import/fields";
import type { ReviewResponse } from "@/lib/income-import/review-types";

import type { WizardBatch } from "./wizard-types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Year-first when every sampled date is, otherwise the Indian day-first default. */
export function guessDateFormat(
  batch: Pick<WizardBatch, "columns" | "mapping">
): ImportDateFormat {
  const header = Object.entries(batch.mapping).find(
    ([, target]) => target === "receivedOn"
  )?.[0];
  const samples =
    batch.columns.find((column) => column.header === header)?.samples ?? [];
  return samples.length > 0 && samples.every((s) => ISO_DATE.test(s))
    ? "ymd"
    : "dmy";
}

const fieldOptions = [
  { label: "Don't import", value: IGNORE_FIELD },
  ...IMPORT_FIELD_KEYS.map((key) => ({
    label: `${IMPORT_FIELD_LABELS[key]}${REQUIRED_IMPORT_FIELDS.includes(key) ? " *" : ""}`,
    value: key,
  })),
];
const dateFormatOptions = DATE_FORMAT_VALUES.map((value) => ({
  label: DATE_FORMAT_LABELS[value],
  value,
}));
const channelOptions = IMPORT_CHANNEL_VALUES.map((value) => ({
  label: CONTRIBUTION_CHANNEL_LABELS[value],
  value,
}));

interface MapValues {
  columns: { header: string; target: ImportMappingTarget }[];
  dateFormat: ImportDateFormat;
  defaultChannel: ImportChannel;
}

const toMapping = (columns: MapValues["columns"]): ImportMapping =>
  Object.fromEntries(columns.map((c) => [c.header, c.target]));

function MappingIssues({ mapping }: { mapping: ImportMapping }) {
  const check = checkMapping(mapping);
  const lines: { text: string; tone: string }[] = [];
  if (check.missing.length > 0) {
    lines.push({
      text: `Still to map: ${check.missing.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}.`,
      tone: "text-destructive",
    });
  }
  if (check.duplicates.length > 0) {
    lines.push({
      text: `Mapped more than once: ${check.duplicates.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}.`,
      tone: "text-destructive",
    });
  }
  if (check.unmappedCurrency) {
    lines.push({
      text: `Map "${check.unmappedCurrency}" to Currency: left out, every row would import as rupees.`,
      tone: "text-destructive",
    });
  }
  if (check.weakIdentity) {
    lines.push({
      text: WEAK_IDENTITY_WARNING,
      tone: "text-warning-foreground",
    });
  }
  if (lines.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-1 text-sm" role="status">
      {lines.map((line) => (
        <p className={line.tone} key={line.text}>
          {line.text}
        </p>
      ))}
    </div>
  );
}

/** For a source with a known export format: the columns the file lacks or adds. */
function ExpectedColumns({ batch }: { batch: WizardBatch }) {
  const expected = sourceRules(batch.source).expectedHeaders;
  if (!expected) {
    return null;
  }
  const { extra, missing } = compareHeaders(
    batch.columns.map((c) => c.header),
    expected
  );
  if (missing.length === 0 && extra.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        All {expected.length} give.do columns found and matched. Check the
        fields below before you continue.
      </p>
    );
  }
  return (
    <div
      className="bg-muted/40 grid gap-1 rounded-lg p-4 text-sm"
      data-testid="expected-columns"
      role="status"
    >
      <p className="font-medium">
        This file differs from the give.do export format
      </p>
      {missing.length > 0 ? (
        <p className="text-warning-foreground">
          Missing columns: {missing.join(", ")}.
        </p>
      ) : null}
      {extra.length > 0 ? (
        <p className="text-muted-foreground">
          Columns give.do does not export: {extra.join(", ")}. Map them below or
          leave them out.
        </p>
      ) : null}
    </div>
  );
}

/** Step 2: which file column fills which field, and how the file writes dates. */
export function MapStep({
  batch,
  formId,
  onBusyChange,
  onReviewed,
}: {
  batch: WizardBatch;
  formId: string;
  onBusyChange: (busy: boolean) => void;
  onReviewed: (review: ReviewResponse) => void;
}) {
  const review = useServerFn(reviewContributionImport);
  const rules = sourceRules(batch.source);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      columns: batch.columns.map((c) => ({
        header: c.header,
        target: batch.mapping[c.header] ?? IGNORE_FIELD,
      })),
      dateFormat:
        rules.fixedDateFormat ?? batch.dateFormat ?? guessDateFormat(batch),
      defaultChannel: (rules.fixedChannel ??
        batch.defaultChannel) as ImportChannel,
    } satisfies MapValues as MapValues,
    onSubmit: async ({ value }) => {
      const mapping = toMapping(value.columns);
      const problem = mappingProblem(checkMapping(mapping));
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      onBusyChange(true);
      try {
        onReviewed(
          await review({
            data: {
              batchId: batch.batchId,
              dateFormat: value.dateFormat,
              defaultChannel: value.defaultChannel,
              mapping,
            },
          })
        );
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "The review failed."
        );
      } finally {
        onBusyChange(false);
      }
    },
  });

  return (
    <FormLayout form={form} id={formId}>
      <ExpectedColumns batch={batch} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          description={
            rules.fixedDateFormat
              ? "give.do writes dates as day/month/year."
              : "Only numeric dates such as 03/04/2026 depend on this."
          }
          disabled={rules.fixedDateFormat !== null}
          isRequired
          label="Dates in the file are written as"
          name="dateFormat"
          options={dateFormatOptions}
        />
        {rules.fixedChannel ? null : (
          <SelectField
            description="Used for rows without a channel column or value."
            isRequired
            label="Channel"
            name="defaultChannel"
            options={channelOptions}
          />
        )}
      </div>
      <div className="ring-border rounded-lg ring-1">
        <div className="text-muted-foreground hidden grid-cols-[1fr_1.2fr_1fr] gap-4 border-b px-4 py-2 text-xs font-medium sm:grid">
          <span>File column</span>
          <span>Example values</span>
          <span>Dashboard field</span>
        </div>
        <ul className="divide-y">
          {batch.columns.map((column, index) => (
            <li
              className="grid items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_1.2fr_1fr] sm:gap-4"
              data-column={column.header}
              key={column.header}
            >
              <span className="flex min-w-0 items-center gap-2 font-medium">
                <span className="truncate">{column.header}</span>
                <HugeiconsIcon
                  className="text-muted-foreground hidden size-4 shrink-0 sm:block"
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                />
              </span>
              <span className="text-muted-foreground min-w-0 truncate text-sm">
                {column.samples.length > 0
                  ? column.samples.join(" · ")
                  : "(empty)"}
              </span>
              <SelectField
                hideLabel
                label={`Field for ${column.header}`}
                name={`columns[${index}].target`}
                options={fieldOptions}
              />
            </li>
          ))}
        </ul>
      </div>
      <form.Subscribe selector={(state) => state.values.columns}>
        {(columns) => <MappingIssues mapping={toMapping(columns)} />}
      </form.Subscribe>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </FormLayout>
  );
}
