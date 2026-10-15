import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import type { BalanceLine, BalanceSummary } from "@pi-dash/shared/ledger";
import { formatPaise } from "@pi-dash/shared/money";

import { StatusBadge } from "@/components/shared/status-badge";

import { formatDay } from "./labels";

/**
 * A fund's opening at the year's start (with earlier years' surplus) and
 * the year's figure, as the statements' fund note shows them: the General
 * Fund's current year surplus or deficit; another fund's additions or
 * deductions, its capital receipts (corpus gifts) with any surplus posted
 * to it.
 */
function FundMovement({
  additionsPaise,
  general,
  openingPaise,
  surplusPaise,
}: {
  additionsPaise: number;
  /** The General Fund's year is a surplus or deficit; another fund's, additions or deductions. */
  general: boolean;
  openingPaise: number;
  surplusPaise: number;
}) {
  const parts = [`Opening balance ${formatPaise(openingPaise)}`];
  if (general) {
    parts.push(
      `${surplusPaise < 0 ? "Current year deficit" : "Current year surplus"} ${formatPaise(Math.abs(surplusPaise))}`
    );
    if (additionsPaise !== 0) {
      parts.push(
        `${additionsPaise < 0 ? "Deductions" : "Additions"} during the year ${formatPaise(Math.abs(additionsPaise))}`
      );
    }
  } else {
    const yearPaise = additionsPaise + surplusPaise;
    parts.push(
      `${yearPaise < 0 ? "Deductions" : "Additions"} during the year ${formatPaise(Math.abs(yearPaise))}`
    );
  }
  return (
    <span
      className="text-muted-foreground block text-xs"
      data-testid="balance-fund-movement"
    >
      {parts.join(" · ")}
    </span>
  );
}

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
              <span className="min-w-0">
                <span className="block truncate">{nameOf(line)}</span>
                {line.movement ? (
                  <FundMovement
                    general={line.key === GENERAL_FUND_ID}
                    {...line.movement}
                  />
                ) : null}
              </span>
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
 * from the cash book plus asset entries, against liabilities and funds. A
 * fund carries the income less expenditure posted to it, each year's
 * surplus rolling into its opening for the next; the Corpus Fund also
 * carries the corpus gifts credited to it directly.
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
