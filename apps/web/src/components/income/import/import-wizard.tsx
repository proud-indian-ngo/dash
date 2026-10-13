import {
  ArrowLeft01Icon,
  CheckmarkCircle02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { cn } from "@pi-dash/design-system/lib/utils";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { runContributionImport } from "@/functions/income-import";
import type { RowDecision } from "@/lib/income-import/classify";
import { WEAK_IDENTITY_WARNING } from "@/lib/income-import/fields";
import { summarizeReview } from "@/lib/income-import/review-summary";
import type {
  ReviewResponse,
  RunResponse,
} from "@/lib/income-import/review-types";

import { MapStep } from "./map-step";
import { ReviewTable } from "./review-table";
import { UploadStep } from "./upload-step";
import type { WizardBatch } from "./wizard-types";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "map", label: "Map columns" },
  { id: "review", label: "Review" },
  { id: "done", label: "Import" },
] as const;
type StepId = (typeof STEPS)[number]["id"];

function StepsHeader({ current }: { current: StepId }) {
  // On the result screen every step is complete.
  const index =
    current === "done"
      ? STEPS.length
      : STEPS.findIndex((s) => s.id === current);
  return (
    <ol aria-label="Import steps" className="flex flex-wrap gap-x-6 gap-y-2">
      {STEPS.map((step, i) => (
        <li
          aria-current={i === index ? "step" : undefined}
          className={cn(
            "flex items-center gap-2 text-sm",
            i === index ? "font-semibold" : "text-muted-foreground"
          )}
          key={step.id}
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-xs tabular-nums ring-1",
              i < index && "bg-primary text-primary-foreground ring-primary",
              i === index && "ring-foreground",
              i > index && "ring-border"
            )}
          >
            {i < index ? (
              <HugeiconsIcon
                className="size-3.5"
                icon={CheckmarkCircle02Icon}
                strokeWidth={2}
              />
            ) : (
              i + 1
            )}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
}

const plural = (n: number, one: string, many: string) =>
  `${n.toLocaleString("en-IN")} ${n === 1 ? one : many}`;

function ResultSummary({
  batchId,
  result,
}: {
  batchId: string;
  result: RunResponse;
}) {
  const lines = [
    plural(result.imported, "contribution imported", "contributions imported"),
    plural(result.newDonors, "new donor created", "new donors created"),
    result.linked > 0
      ? plural(
          result.linked,
          "row was already imported",
          "rows were already imported"
        )
      : null,
    result.conflicts > 0
      ? plural(
          result.conflicts,
          "conflict left as is",
          "conflicts left as they are"
        )
      : null,
    result.skipped > 0
      ? plural(result.skipped, "row skipped", "rows skipped")
      : null,
    result.errors > 0
      ? plural(result.errors, "row with errors", "rows with errors")
      : null,
  ].filter(Boolean);
  return (
    <div className="ring-border grid gap-4 rounded-lg p-6 ring-1">
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          className="text-success-foreground size-5"
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
        />
        <h2 className="font-display text-lg font-semibold">Import finished</h2>
      </div>
      <ul className="text-sm" data-testid="import-result">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          render={<Link search={{ batch: batchId }} to="/income" />}
          type="button"
        >
          View imported contributions
        </Button>
        <Button
          render={<Link params={{ batchId }} to="/income/imports/$batchId" />}
          type="button"
          variant="outline"
        >
          Open the import
        </Button>
      </div>
    </div>
  );
}

/**
 * The four-step importer. A new import starts at Upload; the batch page
 * passes an existing batch to continue a draft or retry unresolved rows,
 * which starts at Map columns.
 */
export function ImportWizard({
  initialBatch = null,
  onCancel,
}: {
  initialBatch?: WizardBatch | null;
  onCancel: () => void;
}) {
  const formId = useId();
  const run = useServerFn(runContributionImport);
  const [step, setStep] = useState<StepId>(initialBatch ? "map" : "upload");
  const [batch, setBatch] = useState<WizardBatch | null>(initialBatch);
  const [review, setReview] = useState<ReviewResponse | null>(null);
  const [decisions, setDecisions] = useState<Record<string, RowDecision>>({});
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);

  const handleUploaded = useEventCallback((next: WizardBatch) => {
    setBatch(next);
    setStep("map");
  });
  const handleReviewed = useEventCallback((next: ReviewResponse) => {
    setReview(next);
    setDecisions({});
    setBatch((current) =>
      current
        ? {
            ...current,
            dateFormat: next.batch.dateFormat,
            defaultChannel: next.batch.defaultChannel,
            mapping: next.batch.mapping ?? current.mapping,
          }
        : current
    );
    setStep("review");
  });
  const handleDecide = useEventCallback(
    (rowId: string, decision: RowDecision) =>
      setDecisions((current) => ({ ...current, [rowId]: decision }))
  );
  const back = useEventCallback(() => {
    if (step === "review") {
      setStep("map");
    } else if (step === "map" && !initialBatch) {
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
    try {
      const outcome = await run({
        data: { batchId: batch.batchId, decisions },
      });
      setResult(outcome);
      setConfirmOpen(false);
      setStep("done");
    } catch (error) {
      toast.error("The import did not finish", {
        description:
          error instanceof Error
            ? error.message
            : "Nothing was imported. Try again.",
      });
    } finally {
      setBusy(false);
    }
  });

  const summary = review ? summarizeReview(review.rows, decisions) : null;
  const canImport = summary !== null && summary.imports + summary.links > 0;

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
          formId={formId}
          onBusyChange={setBusy}
          onUploaded={handleUploaded}
        />
      ) : null}
      {step === "map" && batch?.earlierUpload ? (
        <p className="text-sm" role="status">
          This file was uploaded before. Rows imported then will show as already
          imported, not twice.
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
      {step === "review" && review ? (
        <div className="grid gap-4">
          {review.weakIdentity ? (
            <p className="text-warning-foreground text-sm">
              {WEAK_IDENTITY_WARNING}
            </p>
          ) : null}
          {summary && summary.undecided > 0 ? (
            <p className="text-sm" role="status">
              {plural(summary.undecided, "row needs", "rows need")} a decision;
              rows left undecided are skipped and can be retried from the import
              later.
            </p>
          ) : null}
          <ReviewTable
            decisions={decisions}
            onDecide={handleDecide}
            rows={review.rows}
          />
        </div>
      ) : null}
      {step === "done" && result && batch ? (
        <ResultSummary batchId={batch.batchId} result={result} />
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
              {step === "upload" || (step === "map" && initialBatch)
                ? "Cancel"
                : "Back"}
            </Button>
            {step === "review" ? (
              <Button
                disabled={!canImport || busy}
                onClick={() => setConfirmOpen(true)}
                type="button"
              >
                Import{" "}
                {summary
                  ? plural(summary.imports, "contribution", "contributions")
                  : ""}
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
      {summary ? (
        <ConfirmDialog
          confirmLabel="Import"
          description={[
            `${plural(summary.imports, "contribution", "contributions")} will be imported, ${plural(summary.newDonors, "new donor", "new donors")} created, ${plural(summary.skips + summary.errors, "row", "rows")} skipped.`,
            summary.links > 0
              ? `${plural(summary.links, "row is", "rows are")} already imported and will be linked.`
              : "",
            summary.conflicts > 0
              ? `${plural(summary.conflicts, "conflict stays", "conflicts stay")} as they are.`
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          loading={busy}
          loadingLabel="Importing..."
          onConfirm={runImport}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title="Import these contributions?"
          variant="default"
        />
      ) : null}
    </div>
  );
}
