import { FileImportIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useNavigate } from "@tanstack/react-router";

import {
  type ImportBatchRow,
  ImportBatchesTable,
} from "@/components/income/import-batches-table";
import { NotFoundState } from "@/components/shared/not-found-state";

export function ImportsTab({
  canImport,
  onImport,
}: {
  canImport: boolean;
  onImport: () => void;
}) {
  const navigate = useNavigate();
  const [batches, result] = useQuery(queries.importBatch.list());
  const rows = batches as ImportBatchRow[];
  const isLoading = rows.length === 0 && result.type !== "complete";
  const open = useEventCallback((row: ImportBatchRow) => {
    if (row.source === "give_do_payout") {
      navigate({ search: { batch: row.id }, to: "/income/payout/import" });
      return;
    }
    if (row.source === "bank_csv") {
      navigate({
        search: row.orgAccountId ? { account: row.orgAccountId } : {},
        to: "/income/bank",
      });
      return;
    }
    navigate({ params: { batchId: row.id }, to: "/income/imports/$batchId" });
  });

  if (!isLoading && rows.length === 0) {
    return (
      <NotFoundState
        actions={
          canImport ? (
            <Button onClick={onImport} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={FileImportIcon}
                strokeWidth={2}
              />
              Import contributions
            </Button>
          ) : null
        }
        description="Upload a spreadsheet of donations; each upload is listed here with what it imported."
        icon={FileImportIcon}
        title="No imports yet"
      />
    );
  }
  const pending = rows.reduce((sum, row) => sum + (row.pendingCount ?? 0), 0);
  const waitingBatches = rows.filter((row) => (row.pendingCount ?? 0) > 0);
  const oldestWaiting = waitingBatches.at(-1);
  return (
    <>
      {pending > 0 ? (
        <div
          className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
          data-testid="imports-needs-review"
          role="status"
        >
          <span>
            <span className="font-semibold">
              Waiting: {pending.toLocaleString("en-IN")}
            </span>{" "}
            {pending === 1 ? "row waits" : "rows wait"} to sync or for a
            decision in{" "}
            {waitingBatches.length === 1
              ? "1 import"
              : `${waitingBatches.length} imports`}
            .
          </span>
          {oldestWaiting ? (
            <Button
              onClick={() => open(oldestWaiting)}
              size="sm"
              type="button"
              variant="outline"
            >
              Open the oldest
            </Button>
          ) : null}
        </div>
      ) : null}
      <ImportBatchesTable data={rows} isLoading={isLoading} onOpen={open} />
    </>
  );
}
