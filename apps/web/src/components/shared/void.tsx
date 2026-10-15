import { ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import {
  BOOKS_VIEW_PERMISSIONS,
  type PostedSourceType,
} from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";

/**
 * Voiding (finance Option B) on the web: a request or payment the books hold
 * is voided instead of deleted, shows a "Void" badge, and lists hide voided
 * rows until asked.
 */

export function VoidBadge() {
  return (
    <StatusBadge data-testid="void-badge" tone="danger">
      Void
    </StatusBadge>
  );
}

export const isVoided = (row: object): boolean =>
  "voidedAt" in row && Boolean(row.voidedAt);

function useCanSeeBooks() {
  const { hasPermission } = useApp();
  return (
    BOOKS_VIEW_PERMISSIONS.some((p) => hasPermission(p)) ||
    hasPermission("finance.post_opening")
  );
}

/**
 * The IDs of one source type that stand in the books. Empty for people who
 * can't read the books: for them Delete stays, and the server refuses it on
 * a posted record.
 */
export function usePostedSourceIds(
  sourceType: PostedSourceType
): ReadonlySet<string> {
  const canSee = useCanSeeBooks();
  const [states] = useQuery(queries.ledger.postedSources({ sourceType }), {
    enabled: canSee,
  });
  return useMemo(
    () => new Set((canSee ? states : []).map((s) => s.sourceId)),
    [canSee, states]
  );
}

/** Whether one record stands in the books, for its detail page. */
export function useIsPostedInBooks(
  sourceType: PostedSourceType,
  sourceId: string
): boolean {
  const canSee = useCanSeeBooks();
  const [state] = useQuery(
    queries.ledger.sourceState({ sourceId, sourceType }),
    { enabled: canSee }
  );
  return canSee && state?.status === "posted";
}

/**
 * Hides voided rows unless asked: the rows to show, and the toolbar button
 * that shows them ("Show voided · 2"). The button only appears when some
 * row is voided.
 */
export function useVoidedFilter<T extends object>(rows: readonly T[]) {
  const [showVoided, setShowVoided] = useState(false);
  const voidedCount = rows.filter(isVoided).length;
  const visible = useMemo(
    () => (showVoided ? [...rows] : rows.filter((row) => !isVoided(row))),
    [rows, showVoided]
  );
  const toggle = useEventCallback(() => setShowVoided((v) => !v));
  const button =
    voidedCount > 0 ? (
      <Button
        aria-pressed={showVoided}
        data-testid="voided-filter"
        onClick={toggle}
        size="sm"
        type="button"
        variant={showVoided ? "secondary" : "outline"}
      >
        <HugeiconsIcon
          className="size-4"
          icon={ViewOffSlashIcon}
          strokeWidth={2}
        />
        {showVoided ? "Hide voided" : `Show voided · ${voidedCount}`}
      </Button>
    ) : null;
  return { button, rows: visible };
}
