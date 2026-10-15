import { LEDGER_SOURCE_TYPES } from "@pi-dash/shared/ledger";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { sourceLabel } from "./labels";

/**
 * Where a posting's source lives: the contribution sheet (a refund opens
 * its gift's sheet), the settlement sheet, Other income, the bank
 * statements, or the opening balances. Null for a source with no page.
 */
export function sourceLinkProps(
  sourceType: string | undefined,
  sourceId: string | undefined
): { search?: Record<string, string>; to: string } | null {
  if (!(sourceType && sourceId)) {
    return null;
  }
  switch (sourceType) {
    case LEDGER_SOURCE_TYPES.openingBalance:
      return { to: "/finance/books/opening" };
    case LEDGER_SOURCE_TYPES.contribution:
      return {
        search: { contribution: sourceId, tab: "contributions" },
        to: "/income",
      };
    case LEDGER_SOURCE_TYPES.contributionRefund:
      return {
        search: { refund: sourceId, tab: "contributions" },
        to: "/income",
      };
    case LEDGER_SOURCE_TYPES.gatewaySettlement:
      return {
        search: { settlement: sourceId, tab: "settlements" },
        to: "/income",
      };
    case LEDGER_SOURCE_TYPES.otherIncome:
      return { search: { tab: "other" }, to: "/income" };
    case LEDGER_SOURCE_TYPES.statementTransfer:
      return { search: { tab: "matched" }, to: "/income/bank" };
    default:
      return null;
  }
}

/** The source of a posting in words, linking to it where it has a page. */
export function SourceLink({
  children,
  sourceId,
  sourceType,
}: {
  children?: ReactNode;
  sourceId: string | undefined;
  sourceType: string | undefined;
}) {
  const props = sourceLinkProps(sourceType, sourceId);
  const label = children ?? sourceLabel(sourceType);
  if (!props) {
    return <span>{label}</span>;
  }
  return (
    <Link
      className="underline-offset-4 hover:underline"
      search={props.search as never}
      to={props.to as never}
    >
      {label}
    </Link>
  );
}
