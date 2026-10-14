import { queries } from "@pi-dash/zero/queries";
import type { OrgAccount, StatementLine } from "@pi-dash/zero/schema";
import { useQuery } from "@rocicorp/zero/react";
import { format } from "date-fns";

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
