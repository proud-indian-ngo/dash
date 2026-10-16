import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import type { OrgAccount, StatementLine } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";

import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import { epochToLocalDate } from "@/lib/local-date";

type MatchedLine = StatementLine & { orgAccount?: OrgAccount | null };

/** "18 Oct 2026, HDFC current account", or that no bank line is matched yet. */
export function inBankLabel(line: MatchedLine | null | undefined): string {
  if (!line) {
    return "Not matched to a bank line yet";
  }
  const date = epochToLocalDate(line.valueOn);
  return `${date ? format(date, DATE) : "—"}, ${line.orgAccount?.name ?? "bank account"}`;
}

function InBank({
  complete,
  line,
}: {
  complete: boolean;
  line: MatchedLine | null | undefined;
}) {
  if (!(line || complete)) {
    return <span className="text-muted-foreground">…</span>;
  }
  return <span data-testid="in-bank">{inBankLabel(line)}</span>;
}

/**
 * The bank statement line a contribution is matched to, for finance.view
 * and finance.manage holders (the query returns nothing to anyone else).
 */
export function ContributionInBank({
  contributionId,
}: {
  contributionId: string;
}) {
  const [line, result] = useQuery(
    queries.statementLine.byContribution({ contributionId })
  );
  return <InBank complete={result.type === "complete"} line={line} />;
}

/** The bank statement line a settlement is matched to. */
export function SettlementInBank({ settlementId }: { settlementId: string }) {
  const [line, result] = useQuery(
    queries.statementLine.bySettlement({ settlementId })
  );
  return <InBank complete={result.type === "complete"} line={line} />;
}

/**
 * Where an approved reimbursement or vendor payment left the bank (finance
 * layer 3-3b): "Paid from HDFC current account on 12 Aug 2026", one line per
 * matched bank debit with the part it paid when split, or "Not seen in the
 * bank yet". Finance readers only (the query returns nothing to anyone
 * else, and the component isn't asked for).
 */
export function PaidFromBank({
  amountPaise,
  documentId,
  kind,
}: {
  /** The claim's total or the payment's amount, to show a part payment. */
  amountPaise: number;
  documentId: string;
  kind: "reimbursement" | "vendor_payment_transaction";
}) {
  const { hasPermission } = useApp();
  const canSee =
    hasPermission("finance.view") || hasPermission("finance.manage");
  const [allocations, result] = useQuery(
    queries.statementLine.allocationsByDocument({ documentId, kind }),
    { enabled: canSee }
  );
  if (!canSee || (allocations.length === 0 && result.type !== "complete")) {
    return null;
  }
  const paid = allocations.reduce((sum, a) => sum + a.amountPaise, 0);
  return (
    <div className="text-sm" data-testid="paid-from-bank">
      {allocations.length === 0 ? (
        <span className="text-muted-foreground">Not seen in the bank yet</span>
      ) : (
        allocations.map((a) => {
          const line = a.statementLine;
          const date = line ? epochToLocalDate(line.valueOn) : null;
          const part =
            a.amountPaise === amountPaise
              ? ""
              : ` (${formatPaise(a.amountPaise)})`;
          return (
            <div key={a.id}>
              Paid from {line?.orgAccount?.name ?? "the bank"} on{" "}
              {date ? format(date, DATE) : "—"}
              {part}{" "}
              <Link
                className="text-muted-foreground underline-offset-4 hover:underline"
                search={
                  line ? { account: line.orgAccountId, tab: "matched" } : {}
                }
                to="/income/bank"
              >
                statement line
              </Link>
            </div>
          );
        })
      )}
      {allocations.length > 0 && paid < amountPaise ? (
        <div className="text-muted-foreground">
          {formatPaise(amountPaise - paid)} not seen in the bank yet
        </div>
      ) : null}
    </div>
  );
}
