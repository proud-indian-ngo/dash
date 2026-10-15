import { epochDayToIso } from "@pi-dash/shared/income";
import {
  BOOKS_VIEW_PERMISSIONS,
  type IncomeSourceType,
  ledgerReasonLabel,
} from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";

import { useApp } from "@/context/app-context";

import { formatDay } from "./labels";

/**
 * "In the books: posted 16 Oct 2026", or waiting and why, for a record's
 * detail sheet. Only book readers see it; nothing shows until the posting
 * has looked at the record.
 */
export function InTheBooks({
  sourceId,
  sourceType,
}: {
  sourceId: string;
  sourceType: IncomeSourceType;
}) {
  const { hasPermission } = useApp();
  const canSee =
    BOOKS_VIEW_PERMISSIONS.some((p) => hasPermission(p)) ||
    hasPermission("finance.post_opening");
  const [state, result] = useQuery(
    queries.ledger.sourceState({ sourceId, sourceType }),
    { enabled: canSee }
  );
  if (!canSee || (state === undefined && result.type !== "complete")) {
    return null;
  }
  return (
    <p className="text-sm" data-testid="in-the-books">
      <span className="text-muted-foreground">In the books: </span>
      <InTheBooksText state={state ?? null} />{" "}
      <Link
        className="text-muted-foreground underline-offset-4 hover:underline"
        to="/finance/books"
      >
        Open the books
      </Link>
    </p>
  );
}

function InTheBooksText({
  state,
}: {
  state: {
    attentionCount: number | null;
    message: string | null;
    postedOn: number | null;
    reason: string | null;
    status: string;
  } | null;
}) {
  if (!state) {
    return <span>not posted yet</span>;
  }
  if (state.status === "posted") {
    const attention = state.attentionCount ?? 0;
    return (
      <span>
        posted
        {state.postedOn ? ` ${formatDay(epochDayToIso(state.postedOn))}` : ""}
        {attention > 0
          ? `; ${attention} ${attention === 1 ? "line needs" : "lines need"} attention`
          : ""}
      </span>
    );
  }
  if (state.status === "waiting") {
    return (
      <span className="text-warning-foreground">
        waiting: {state.message ?? ledgerReasonLabel(state.reason)}
      </span>
    );
  }
  return <span>not posted: {ledgerReasonLabel(state.reason)}</span>;
}
