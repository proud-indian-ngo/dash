import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  File01Icon,
  Link01Icon,
  RefreshIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { env } from "@pi-dash/env/web";
import type {
  ImportBatchSource,
  ImportBatchStatus,
} from "@pi-dash/shared/constants";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";

import { ImportWizard } from "@/components/income/import/import-wizard";
import { ReviewTable } from "@/components/income/import/review-table";
import type { WizardBatch } from "@/components/income/import/wizard-types";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { StatsCards } from "@/components/stats/stats-cards";
import { useApp } from "@/context/app-context";
import { getContributionImport } from "@/functions/income-import";
import {
  IMPORT_SOURCE_LABELS,
  type ImportDateFormat,
  type ImportMapping,
} from "@/lib/income-import/fields";
import {
  IMPORT_BATCH_STATUS_LABELS,
  IMPORT_BATCH_STATUS_TONES,
} from "@/lib/income-import/labels";
import type { BatchDetailResponse } from "@/lib/income-import/review-types";

export const Route = createFileRoute("/_app/income/imports/$batchId")({
  component: ImportBatchPage,
  head: () => ({
    meta: [{ title: `Import | ${env.VITE_APP_NAME}` }],
  }),
});

/** Rows carry donor details from the file, so only donor roles load them. */
function useBatchDetail(batchId: string, enabled: boolean, refresh: number) {
  const load = useServerFn(getContributionImport);
  const [detail, setDetail] = useState<BatchDetailResponse | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) {
      return;
    }
    let cancelled = false;
    load({ data: { batchId } })
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailed(true);
        }
        log.error({
          action: "income.importDetail",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "ImportBatchPage",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [batchId, enabled, load, refresh]);
  return { detail, failed };
}

function ImportBatchPage() {
  const { batchId } = Route.useParams();
  const { hasPermission } = useApp();
  const canManage = hasPermission("donors.manage");
  const canSeeRows = canManage || hasPermission("donors.view");
  const [batch, result] = useQuery(queries.importBatch.byId({ id: batchId }));
  const [refresh, setRefresh] = useState(0);
  const [continuing, setContinuing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const { detail, failed } = useBatchDetail(batchId, canSeeRows, refresh);

  if (!batch) {
    if (result.type !== "complete") {
      return (
        <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
          <Skeleton className="h-8 w-64" />
        </div>
      );
    }
    return (
      <NotFoundState
        description="This import does not exist or you cannot see it."
        icon={File01Icon}
        title="Import not found"
      />
    );
  }

  const status = batch.status as ImportBatchStatus;
  const importedCount = batch.importedCount ?? 0;
  const linkedCount = batch.linkedCount ?? 0;
  const conflictCount = batch.conflictCount ?? 0;
  const errorCount = batch.errorCount ?? 0;
  const pendingCount = batch.pendingCount ?? 0;
  const isRazorpay = batch.source === "razorpay_api";
  const unresolved = batch.rowCount - importedCount - linkedCount;
  const neverImported = importedCount + linkedCount === 0;
  const canContinue =
    canManage &&
    !isRazorpay &&
    detail !== null &&
    status !== "expired" &&
    status !== "importing" &&
    unresolved > 0 &&
    detail.columns.length > 0;
  // Razorpay payments have no columns to map: review starts from the rows.
  const canReview =
    canManage &&
    isRazorpay &&
    Boolean(batch.orgAccountId) &&
    detail?.review != null &&
    status !== "importing" &&
    pendingCount > 0;
  const wizardBatch: WizardBatch | null = detail
    ? {
        batchId: batch.id,
        columns: detail.columns,
        dateFormat: (batch.dateFormat as ImportDateFormat | null) ?? null,
        defaultChannel: batch.defaultChannel,
        earlierUpload: null,
        fileName: batch.fileName,
        mapping: (batch.mapping as ImportMapping | null) ?? {},
        rowCount: batch.rowCount,
      }
    : null;

  if (reviewing && wizardBatch && detail?.review) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <PageHeader
          description="Choose the donor for each payment, or skip it. Payments left undecided stay here for later."
          title="Review Razorpay payments"
        />
        <div className="mt-6">
          <ImportWizard
            initialBatch={wizardBatch}
            initialReview={detail.review}
            onCancel={() => {
              setReviewing(false);
              setRefresh((n) => n + 1);
            }}
          />
        </div>
      </div>
    );
  }

  if (continuing && wizardBatch) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <PageHeader
          description="Only rows that are not imported yet are processed again."
          title={neverImported ? "Continue import" : "Retry unresolved rows"}
        />
        <div className="mt-6">
          <ImportWizard
            initialBatch={wizardBatch}
            onCancel={() => {
              setContinuing(false);
              setRefresh((n) => n + 1);
            }}
          />
        </div>
      </div>
    );
  }

  const uploaded = new Date(batch.createdAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="app-container mx-auto grid max-w-7xl gap-6 px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          <>
            {importedCount > 0 ? (
              <Button
                render={<Link search={{ batch: batch.id }} to="/income" />}
                type="button"
                variant="outline"
              >
                View contributions
              </Button>
            ) : null}
            {canReview ? (
              <Button onClick={() => setReviewing(true)} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={Clock01Icon}
                  strokeWidth={2}
                />
                Review {pendingCount.toLocaleString("en-IN")}{" "}
                {pendingCount === 1 ? "payment" : "payments"}
              </Button>
            ) : null}
            {canContinue ? (
              <Button onClick={() => setContinuing(true)} type="button">
                <HugeiconsIcon
                  className="size-4"
                  icon={RefreshIcon}
                  strokeWidth={2}
                />
                {neverImported ? "Continue import" : "Retry unresolved rows"}
              </Button>
            ) : null}
          </>
        }
        badge={
          <StatusBadge tone={IMPORT_BATCH_STATUS_TONES[status]}>
            {IMPORT_BATCH_STATUS_LABELS[status]}
          </StatusBadge>
        }
        kicker={
          <Link
            className="hover:underline"
            search={{ tab: "imports" }}
            to="/income"
          >
            Income · Imports
          </Link>
        }
        meta={[
          IMPORT_SOURCE_LABELS[batch.source as ImportBatchSource],
          `${isRazorpay ? "Opened" : "Uploaded"} ${uploaded}`,
          batch.uploadedByUser?.name ? `by ${batch.uploadedByUser.name}` : null,
          batch.orgAccount?.name ? `into ${batch.orgAccount.name}` : null,
        ]}
        title={batch.fileName}
      />
      <StatsCards
        items={[
          { icon: File01Icon, label: "Rows", value: batch.rowCount },
          {
            icon: Clock01Icon,
            label: "Needs review",
            tone: pendingCount > 0 ? "warning" : "neutral",
            value: pendingCount,
          },
          {
            icon: CheckmarkCircle02Icon,
            label: "Imported",
            value: importedCount,
          },
          {
            icon: UserAdd01Icon,
            label: "New donors",
            value: batch.newDonorCount ?? 0,
          },
          { icon: Link01Icon, label: "Already imported", value: linkedCount },
          {
            icon: Alert02Icon,
            label: "Conflicts",
            tone: conflictCount > 0 ? "warning" : "neutral",
            value: conflictCount,
          },
          {
            icon: Alert02Icon,
            label: "Skipped",
            value: batch.skippedCount ?? 0,
          },
          {
            icon: Alert02Icon,
            label: "Errors",
            tone: errorCount > 0 ? "danger" : "neutral",
            value: errorCount,
          },
        ]}
      />
      {isRazorpay && !batch.orgAccountId ? (
        <p className="text-warning-foreground text-sm" role="status">
          These payments wait for the Razorpay clearing account. Choose it in{" "}
          <Link className="underline" to="/settings/integrations">
            Settings → Integrations
          </Link>
          , then review them here.
        </p>
      ) : null}
      {status === "expired" ? (
        <p className="text-muted-foreground text-sm">
          This upload was never imported, so its rows were deleted after 30
          days. Upload the file again to import it.
        </p>
      ) : null}
      {canSeeRows && detail?.review ? (
        <ReviewTable readOnly rows={detail.review.rows} />
      ) : null}
      {canSeeRows && detail && !detail.review && status !== "expired" ? (
        <p className="text-muted-foreground text-sm">
          The columns of this upload have not been matched yet.
          {canManage ? " Continue the import to match them." : ""}
        </p>
      ) : null}
      {canSeeRows && failed ? (
        <p className="text-destructive text-sm">
          The rows could not be loaded.
        </p>
      ) : null}
      {canSeeRows ? null : (
        <p className="text-muted-foreground text-sm">
          Row details include donor names and contacts, so they are shown to
          donor managers only.
        </p>
      )}
    </div>
  );
}
