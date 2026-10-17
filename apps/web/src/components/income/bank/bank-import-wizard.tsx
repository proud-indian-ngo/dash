import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { ComboboxField } from "@/components/form/combobox-field";
import { FormLayout } from "@/components/form/form-layout";
import { SelectField } from "@/components/form/select-field";
import { StepsHeader } from "@/components/income/import/import-wizard";
import { FileDrop } from "@/components/income/import/upload-step";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  createBankStatementImport,
  reviewBankStatementImport,
  runBankStatementImport,
} from "@/functions/bank-statements";
import {
  AMOUNT_LAYOUT_LABELS,
  BANK_FIELD_KEYS,
  BANK_FIELD_LABELS,
  BANK_IGNORE_FIELD,
  type BankMapping,
  type BankMappingTarget,
  checkBankMapping,
  findStatementHeaderRow,
} from "@/lib/bank-statement/fields";
import type {
  CreateStatementBatchResponse,
  StatementReviewResponse,
  StatementRunResponse,
} from "@/lib/bank-statement/types";
import {
  DATE_FORMAT_LABELS,
  DATE_FORMAT_VALUES,
  type ImportDateFormat,
  MAX_IMPORT_FILE_BYTES,
} from "@/lib/income-import/fields";
import { CsvParseError, parseCsv } from "@/lib/income-import/parse-csv";

import { StatementReviewTable } from "./statement-review-table";

type Step = "upload" | "map" | "review" | "done";

interface WizardBatch extends CreateStatementBatchResponse {
  fileName: string;
  orgAccountId: string;
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

const uploadSchema = z.object({
  orgAccountId: z
    .string()
    .optional()
    .refine((value) => Boolean(value), "Pick the bank account"),
});

/** Step 1: which bank account the statement is for, and the file. */
function UploadStep({
  defaultAccountId,
  formId,
  onBusyChange,
  onUploaded,
}: {
  defaultAccountId: string | undefined;
  formId: string;
  onBusyChange: (busy: boolean) => void;
  onUploaded: (batch: WizardBatch) => void;
}) {
  const upload = useServerFn(createBankStatementImport);
  const [accounts] = useQuery(queries.orgAccount.active());
  const banks = accounts.filter((account) => account.kind === "bank");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      orgAccountId: defaultAccountId,
    } as z.input<typeof uploadSchema>,
    onSubmit: async ({ value }) => {
      if (!file) {
        setFileError("Choose a CSV file");
        return;
      }
      if (file.size > MAX_IMPORT_FILE_BYTES) {
        setFileError("The file is larger than 5 MB; split it and try again.");
        return;
      }
      const text = await file.text();
      try {
        parseCsv(text, { findHeaderRow: findStatementHeaderRow });
      } catch (error) {
        setFileError(
          error instanceof CsvParseError
            ? error.message
            : "The file could not be read."
        );
        return;
      }
      onBusyChange(true);
      const orgAccountId = value.orgAccountId ?? "";
      await upload({
        data: { csv: text, fileName: file.name, orgAccountId },
      })
        .then((result) =>
          onUploaded({ ...result, fileName: file.name, orgAccountId })
        )
        .catch((error: unknown) => {
          setFileError(
            error instanceof Error ? error.message : "The upload failed."
          );
        })
        .finally(() => onBusyChange(false));
    },
    validators: { onSubmit: uploadSchema },
  });
  const handleFile = useEventCallback((chosen: File) => {
    setFile(chosen);
    setFileError(null);
  });

  return (
    <FormLayout form={form} id={formId}>
      <div className="grid gap-4 sm:grid-cols-2">
        <ComboboxField
          emptyMessage="No active bank accounts. Add one in Settings → Organisation accounts."
          isRequired
          label="Bank account"
          name="orgAccountId"
          options={banks.map((b) => ({ label: b.name, value: b.id }))}
          placeholder="Search bank accounts..."
        />
      </div>
      <FileDrop error={fileError} file={file} onFile={handleFile} />
      <div className="bg-muted/40 rounded-lg p-4 text-sm">
        <p className="font-medium">What the file needs</p>
        <p className="text-muted-foreground mt-1">
          The statement exported from net banking as CSV (in Excel, Save As →
          CSV UTF-8). Lines above the column headings, opening balance and
          totals lines are skipped. Uploading overlapping periods is fine: lines
          already imported are recognised and not added again.
        </p>
      </div>
    </FormLayout>
  );
}

const fieldOptions = [
  { label: "Don't import", value: BANK_IGNORE_FIELD },
  ...BANK_FIELD_KEYS.map((key) => ({
    label: BANK_FIELD_LABELS[key],
    value: key,
  })),
];
const dateFormatOptions = DATE_FORMAT_VALUES.map((value) => ({
  label: DATE_FORMAT_LABELS[value],
  value,
}));

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

/** Year-first when every sampled date is, otherwise the Indian day-first default. */
function guessDateFormat(batch: WizardBatch): ImportDateFormat {
  const header = Object.entries(batch.mapping).find(
    ([, target]) => target === "valueOn"
  )?.[0];
  const samples =
    batch.columns.find((column) => column.header === header)?.samples ?? [];
  return samples.length > 0 && samples.every((s) => ISO_DATE.test(s))
    ? "ymd"
    : "dmy";
}

interface MapValues {
  columns: { header: string; target: BankMappingTarget }[];
  dateFormat: ImportDateFormat;
}

const toMapping = (columns: MapValues["columns"]): BankMapping =>
  Object.fromEntries(columns.map((c) => [c.header, c.target]));

function MappingStatus({ mapping }: { mapping: BankMapping }) {
  const check = checkBankMapping(mapping);
  if (check.problem) {
    return (
      <p className="text-destructive text-sm" role="status">
        {check.problem}
      </p>
    );
  }
  return (
    <p className="text-muted-foreground text-sm" role="status">
      Amounts: {check.layout ? AMOUNT_LAYOUT_LABELS[check.layout] : "—"}.
    </p>
  );
}

/** Step 2: which column fills which field, and how dates are written. */
function MapStep({
  batch,
  formId,
  onBusyChange,
  onReviewed,
}: {
  batch: WizardBatch;
  formId: string;
  onBusyChange: (busy: boolean) => void;
  onReviewed: (review: StatementReviewResponse) => void;
}) {
  const review = useServerFn(reviewBankStatementImport);
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    defaultValues: {
      columns: batch.columns.map((c) => ({
        header: c.header,
        target: batch.mapping[c.header] ?? BANK_IGNORE_FIELD,
      })),
      dateFormat: batch.dateFormat ?? guessDateFormat(batch),
    } satisfies MapValues as MapValues,
    onSubmit: async ({ value }) => {
      const mapping = toMapping(value.columns);
      const problem = checkBankMapping(mapping).problem;
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      onBusyChange(true);
      await review({
        data: {
          batchId: batch.batchId,
          dateFormat: value.dateFormat,
          mapping,
        },
      })
        .then(onReviewed)
        .catch((caught: unknown) => {
          setError(
            caught instanceof Error ? caught.message : "The review failed."
          );
        })
        .finally(() => onBusyChange(false));
    },
  });

  return (
    <FormLayout form={form} id={formId}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          description="Only numeric dates such as 03/04/2026 depend on this; two-digit years are read as 20xx."
          isRequired
          label="Dates in the file are written as"
          name="dateFormat"
          options={dateFormatOptions}
        />
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
        {(columns) => <MappingStatus mapping={toMapping(columns)} />}
      </form.Subscribe>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </FormLayout>
  );
}

function ResultSummary({
  orgAccountId,
  result,
}: {
  orgAccountId: string;
  result: StatementRunResponse;
}) {
  const lines = [
    plural(result.imported, "line imported", "lines imported"),
    plural(
      result.existing,
      "line was already imported",
      "lines were already imported"
    ),
    result.skipped > 0
      ? plural(result.skipped, "row skipped", "rows skipped")
      : null,
    result.errors > 0
      ? plural(result.errors, "row with errors", "rows with errors")
      : null,
    plural(result.matched, "line matched", "lines matched"),
    plural(
      result.suggested,
      "line has a suggestion",
      "lines have a suggestion"
    ),
  ].filter(Boolean);
  return (
    <div className="ring-border grid gap-4 rounded-lg p-6 ring-1">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          className="text-success-foreground size-5"
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
        />
        <h2 className="font-display text-lg font-semibold">
          Statement imported
        </h2>
      </div>
      <ul className="text-sm" data-testid="statement-import-result">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div>
        <Button
          render={
            <Link
              search={{ account: orgAccountId, tab: "review" }}
              to="/income/bank"
            />
          }
          type="button"
        >
          Review the lines
        </Button>
      </div>
    </div>
  );
}

/**
 * Why rows were skipped, so a wrong date format or amount mapping is
 * noticed before importing: skipped rows are normally only headings,
 * opening balances and totals.
 */
function SkippedBreakdown({ rows }: { rows: StatementReviewResponse["rows"] }) {
  const noDate = rows.filter((r) => r.skipReason === "no_date").length;
  const noAmount = rows.filter((r) => r.skipReason === "no_amount").length;
  const badDates = rows.filter(
    (r) => r.category === "error" && r.errors.some((e) => e.field === "valueOn")
  ).length;
  if (noDate + noAmount + badDates === 0) {
    return null;
  }
  const parts = [
    noDate > 0 ? plural(noDate, "row has no date", "rows have no date") : null,
    noAmount > 0
      ? plural(noAmount, "row has no amount", "rows have no amount")
      : null,
  ].filter(Boolean);
  return (
    <div
      className={
        badDates > 0
          ? "border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 rounded-md border p-3 text-sm"
          : "text-muted-foreground text-sm"
      }
      data-testid="statement-skipped-breakdown"
      role="status"
    >
      {parts.length > 0 ? (
        <p>
          Skipped: {parts.join(", ")}. These are usually headings, opening
          balances and totals; check the Skipped tab.
        </p>
      ) : null}
      {badDates > 0 ? (
        <p>
          {plural(badDates, "row has a date", "rows have dates")} that can't be
          read with the chosen format. Go back and check the date format.
        </p>
      ) : null}
    </div>
  );
}

/** Upload, map, review and import one bank statement. */
export function BankImportWizard({
  defaultAccountId,
  onCancel,
}: {
  defaultAccountId: string | undefined;
  onCancel: () => void;
}) {
  const formId = useId();
  const run = useServerFn(runBankStatementImport);
  const [step, setStep] = useState<Step>("upload");
  const [batch, setBatch] = useState<WizardBatch | null>(null);
  const [review, setReview] = useState<StatementReviewResponse | null>(null);
  const [result, setResult] = useState<StatementRunResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleUploaded = useEventCallback((next: WizardBatch) => {
    setBatch(next);
    setStep("map");
  });
  const handleReviewed = useEventCallback((next: StatementReviewResponse) => {
    setReview(next);
    setBatch((current) =>
      current
        ? {
            ...current,
            dateFormat: next.batch.dateFormat,
            mapping: next.batch.mapping,
          }
        : current
    );
    setStep("review");
  });
  const back = useEventCallback(() => {
    if (step === "review") {
      setStep("map");
    } else if (step === "map") {
      setBatch(null);
      setStep("upload");
    } else {
      onCancel();
    }
  });
  const runImport = useEventCallback(async () => {
    if (!batch) {
      return;
    }
    setBusy(true);
    await run({ data: { batchId: batch.batchId } })
      .then((next) => {
        setResult(next);
        setConfirmOpen(false);
        setStep("done");
      })
      .catch((error: unknown) => {
        toast.error("The statement was not imported", {
          description:
            error instanceof Error
              ? error.message
              : "Nothing was imported. Try again.",
        });
      })
      .finally(() => setBusy(false));
  });

  const counts = review?.counts;
  return (
    <div className="grid gap-6 pb-24">
      <StepsHeader current={step} />
      {batch && step !== "upload" ? (
        <p className="text-muted-foreground text-sm">
          {batch.fileName} · {plural(batch.rowCount, "row", "rows")}
        </p>
      ) : null}
      {step === "upload" ? (
        <UploadStep
          defaultAccountId={defaultAccountId}
          formId={formId}
          onBusyChange={setBusy}
          onUploaded={handleUploaded}
        />
      ) : null}
      {step === "map" && batch?.earlierUpload ? (
        <p className="text-sm" role="status">
          This file was uploaded before. Lines imported then show as already
          imported and are not added twice.
        </p>
      ) : null}
      {step === "map" && batch ? (
        <MapStep
          batch={batch}
          formId={formId}
          onBusyChange={setBusy}
          onReviewed={handleReviewed}
        />
      ) : null}
      {step === "review" && review && counts ? (
        <div className="grid gap-4">
          <p className="text-sm" data-testid="statement-review-summary">
            {plural(counts.new, "new line", "new lines")},{" "}
            {plural(counts.existing, "already imported", "already imported")},{" "}
            {plural(counts.skipped, "row skipped", "rows skipped")},{" "}
            {plural(counts.error, "error", "errors")}.
          </p>
          <SkippedBreakdown rows={review.rows} />
          <StatementReviewTable rows={review.rows} />
        </div>
      ) : null}
      {step === "done" && result && batch ? (
        <ResultSummary orgAccountId={batch.orgAccountId} result={result} />
      ) : null}

      {step === "done" ? null : (
        <div className="bg-background/95 supports-backdrop-filter:bg-background/80 fixed inset-x-0 bottom-0 z-10 border-t backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3">
            <Button onClick={back} type="button" variant="outline">
              <HugeiconsIcon
                className="size-4"
                icon={ArrowLeft01Icon}
                strokeWidth={2}
              />
              {step === "upload" ? "Cancel" : "Back"}
            </Button>
            {step === "review" ? (
              <Button
                disabled={
                  busy || (counts?.new ?? 0) + (counts?.existing ?? 0) === 0
                }
                onClick={() => setConfirmOpen(true)}
                type="button"
              >
                Import {plural(counts?.new ?? 0, "line", "lines")}
              </Button>
            ) : (
              <Button disabled={busy} form={formId} type="submit">
                {busy ? (
                  <>
                    <BrailleSpinner variant="inline" />
                    {step === "upload" ? "Uploading..." : "Checking rows..."}
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            )}
          </div>
        </div>
      )}
      {counts ? (
        <ConfirmDialog
          confirmLabel="Import lines"
          description={`${plural(counts.new, "line", "lines")} will be added to the account and matched where the evidence is exact. ${plural(counts.existing, "line is", "lines are")} already imported, ${plural(counts.skipped + counts.error, "row", "rows")} skipped. No donation is created.`}
          loading={busy}
          loadingLabel="Importing..."
          onConfirm={runImport}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title="Import these statement lines?"
          variant="default"
        />
      ) : null}
    </div>
  );
}
