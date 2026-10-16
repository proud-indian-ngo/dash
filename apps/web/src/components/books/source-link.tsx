import { LEDGER_SOURCE_TYPES } from "@pi-dash/shared/ledger";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { sourceLabel } from "./labels";

/**
 * Where a posting's source lives: the contribution sheet (a refund opens
 * its gift's sheet), the settlement sheet, Other income, the bank
 * statements, the opening balances, the audited figures, or a reimbursement or vendor payment
 * request. Null for a source with no page (a vendor payment's payment
 * opens its request through `VendorPaymentMadeLink`).
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
    case LEDGER_SOURCE_TYPES.auditedFigures:
      return { to: "/finance/books/audited" };
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
    case LEDGER_SOURCE_TYPES.statementCharge:
      return { search: { tab: "matched" }, to: "/income/bank" };
    case LEDGER_SOURCE_TYPES.reimbursement:
      return { to: `/reimbursements/${sourceId}` };
    case LEDGER_SOURCE_TYPES.vendorPayment:
      return { to: `/vendor-payments/${sourceId}` };
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
  const label = children ?? sourceLabel(sourceType);
  if (sourceType === LEDGER_SOURCE_TYPES.vendorPaymentTransaction && sourceId) {
    return <VendorPaymentMadeLink label={label} transactionId={sourceId} />;
  }
  const props = sourceLinkProps(sourceType, sourceId);
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

/** A vendor payment's payment opens its request, once the payment is loaded. */
function VendorPaymentMadeLink({
  label,
  transactionId,
}: {
  label: ReactNode;
  transactionId: string;
}) {
  const [payment] = useQuery(
    queries.vendorPaymentTransaction.requestOf({ id: transactionId })
  );
  if (!payment) {
    return <span>{label}</span>;
  }
  return (
    <Link
      className="underline-offset-4 hover:underline"
      params={{ id: payment.vendorPaymentId }}
      to="/vendor-payments/$id"
    >
      {label}
    </Link>
  );
}
