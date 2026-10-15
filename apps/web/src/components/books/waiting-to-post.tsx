import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { epochDayToIso } from "@pi-dash/shared/income";
import { ledgerReasonLabel } from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { DetailSheetHeader } from "@/components/shared/detail-sheet-header";
import { Sheet, SheetContent } from "@/components/shared/responsive-sheet";
import { postPendingFn } from "@/functions/books";

import { formatDay, sourceLabel } from "./labels";
import { SourceLink } from "./source-link";

interface StateRow {
  attentionCount: number | null;
  economicOn: number | null;
  id: string;
  message: string | null;
  reason: string | null;
  sourceId: string;
  sourceType: string;
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-IN")} ${count === 1 ? one : many}`;

/** Runs "Post pending" and says what happened. */
export function usePostPending() {
  const run = useServerFn(postPendingFn);
  const [posting, setPosting] = useState(false);
  const post = useEventCallback(async () => {
    setPosting(true);
    try {
      const result = await run();
      const parts = [
        plural(result.posted, "posting", "postings"),
        ...(result.reversed > 0
          ? [plural(result.reversed, "reversal", "reversals")]
          : []),
        ...(result.waiting > 0 ? [`${result.waiting} still waiting`] : []),
      ];
      toast.success(
        result.posted + result.reversed === 0
          ? "The books are up to date"
          : `Posted: ${parts.join(", ")}`,
        result.remaining > 0
          ? {
              description: `${plural(result.remaining, "record continues", "records continue")} posting in the background.`,
            }
          : undefined
      );
    } catch (error) {
      toast.error("Couldn't post the waiting records", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPosting(false);
    }
  });
  return { post, posting };
}

/**
 * The Books page's "Waiting to post" banner: income records that should be
 * in the books but can't be yet (a closed year, no bank account picked,
 * reference data missing, an error), payouts with lines that need a look,
 * and, for finance admins, "Post pending".
 */
export function WaitingToPost({ canPost }: { canPost: boolean }) {
  const [waiting] = useQuery(queries.ledger.waiting());
  const [attention] = useQuery(queries.ledger.needsAttention());
  const [open, setOpen] = useState(false);
  const { post, posting } = usePostPending();
  const rows = waiting as StateRow[];
  const attentionRows = attention as StateRow[];
  const attentionLines = attentionRows.reduce(
    (sum, row) => sum + (row.attentionCount ?? 0),
    0
  );
  if (rows.length === 0 && attentionLines === 0) {
    return null;
  }
  return (
    <>
      <div
        className="border-warning/30 bg-warning/10 text-warning-foreground dark:bg-warning-foreground/10 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
        data-testid="waiting-to-post"
        role="status"
      >
        <span>
          {rows.length > 0 ? (
            <span className="font-semibold">
              Waiting to post: {rows.length.toLocaleString("en-IN")}
            </span>
          ) : null}
          {rows.length > 0 && attentionLines > 0 ? " · " : null}
          {attentionLines > 0
            ? `${plural(attentionLines, "payout line needs", "payout lines need")} a look`
            : null}
        </span>
        <span className="flex gap-2">
          <Button
            onClick={() => setOpen(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            Show
          </Button>
          {canPost ? (
            <Button
              disabled={posting}
              onClick={post}
              size="sm"
              type="button"
              variant="outline"
            >
              {posting ? "Posting..." : "Post pending"}
            </Button>
          ) : null}
        </span>
      </div>
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetContent>
          <DetailSheetHeader
            description="Records that should be in the books but can't be yet, and why. Fix the reason, then post pending."
            meta={[
              plural(rows.length, "record waiting", "records waiting"),
              attentionLines > 0
                ? plural(attentionLines, "payout line", "payout lines")
                : null,
            ]}
            title="Waiting to post"
          />
          <StateList
            emptyLabel="Nothing is waiting."
            rows={rows}
            testId="waiting-list"
            text={(row) => row.message ?? ledgerReasonLabel(row.reason)}
          />
          {attentionRows.length > 0 ? (
            <>
              <h3 className="mx-6 mb-2 text-sm font-semibold">
                Payout lines that need a look
              </h3>
              <p className="text-muted-foreground mx-6 mb-2 text-sm">
                Adjustments, and lines whose gift or refund isn't recorded here.
                The payout itself is posted; these lines aren't.
              </p>
              <StateList
                emptyLabel=""
                rows={attentionRows}
                testId="attention-list"
                text={(row) => plural(row.attentionCount ?? 0, "line", "lines")}
              />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}

function StateList({
  emptyLabel,
  rows,
  testId,
  text,
}: {
  emptyLabel: string;
  rows: readonly StateRow[];
  testId: string;
  text: (row: StateRow) => string;
}) {
  if (rows.length === 0) {
    return emptyLabel ? (
      <p className="text-muted-foreground mx-6 mb-6 text-sm">{emptyLabel}</p>
    ) : null;
  }
  return (
    <ul className="mx-6 mb-6 divide-y rounded-lg border" data-testid={testId}>
      {rows.map((row) => (
        <li
          className="flex items-start justify-between gap-3 px-3 py-2.5 text-sm"
          key={row.id}
        >
          <span className="min-w-0">
            <span className="block">
              <SourceLink sourceId={row.sourceId} sourceType={row.sourceType}>
                {sourceLabel(row.sourceType)}
              </SourceLink>
              {row.economicOn
                ? ` · ${formatDay(epochDayToIso(row.economicOn))}`
                : ""}
            </span>
            <span className="text-muted-foreground block">{text(row)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
