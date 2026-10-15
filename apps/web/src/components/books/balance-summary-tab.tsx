import type { BalanceLine, BalanceSummary } from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";

import { StatusBadge } from "@/components/shared/status-badge";

import { formatDay } from "./labels";

function Section({
  label,
  lines,
  nameOf,
  testId,
  totalPaise,
}: {
  label: string;
  lines: readonly BalanceLine[];
  nameOf: (line: BalanceLine) => string;
  testId: string;
  totalPaise: number;
}) {
  return (
    <section aria-label={label} data-testid={testId}>
      <h2 className="mb-2 text-sm font-semibold">{label}</h2>
      <ul className="divide-y rounded-lg border">
        {lines.length === 0 ? (
          <li className="text-muted-foreground px-3 py-2.5 text-sm">None</li>
        ) : (
          lines.map((line) => (
            <li
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              key={`${line.kind}:${line.key}`}
            >
              <span className="min-w-0 truncate">{nameOf(line)}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {formatPaise(line.paise)}
              </span>
            </li>
          ))
        )}
        <li className="bg-muted/40 flex items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold">
          <span>Total {label.toLowerCase()}</span>
          <span
            className="shrink-0 font-mono tabular-nums"
            data-testid={`${testId}-total`}
          >
            {formatPaise(totalPaise)}
          </span>
        </li>
      </ul>
    </section>
  );
}

/**
 * What the trust has, owes and holds in funds at a date: account balances
 * from the cash book plus asset entries, against liabilities, fund
 * balances and income less expenditure since the cutover.
 */
export function BalanceSummaryTab({
  asOf,
  nameOf,
  summary,
}: {
  asOf: string;
  nameOf: (line: BalanceLine) => string;
  summary: BalanceSummary;
}) {
  return (
    <div className="grid gap-4" data-testid="balance-summary">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">As of {formatDay(asOf)}</span>
        {summary.balanced ? (
          <StatusBadge data-testid="balance-check" tone="success">
            Balances
          </StatusBadge>
        ) : (
          <StatusBadge data-testid="balance-check" tone="warning">
            Off by {formatPaise(Math.abs(summary.differencePaise))}
          </StatusBadge>
        )}
        <span className="text-muted-foreground">
          Assets {formatPaise(summary.assetsPaise)} = funds and liabilities{" "}
          {formatPaise(summary.fundsPaise + summary.liabilitiesPaise)}
        </span>
      </div>
      <div className="grid gap-4 *:min-w-0 lg:grid-cols-2">
        <Section
          label="Assets"
          lines={summary.assets}
          nameOf={nameOf}
          testId="balance-assets"
          totalPaise={summary.assetsPaise}
        />
        <div className="grid content-start gap-4">
          <Section
            label="Funds"
            lines={summary.funds}
            nameOf={nameOf}
            testId="balance-funds"
            totalPaise={summary.fundsPaise}
          />
          <Section
            label="Liabilities"
            lines={summary.liabilities}
            nameOf={nameOf}
            testId="balance-liabilities"
            totalPaise={summary.liabilitiesPaise}
          />
        </div>
      </div>
    </div>
  );
}
