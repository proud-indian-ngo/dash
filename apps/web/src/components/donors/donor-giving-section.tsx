import type { ContributionChannel } from "@pi-dash/shared/constants";
import {
  CONTRIBUTION_CHANNEL_LABELS,
  currentFinancialYear,
} from "@pi-dash/shared/income";
import { formatPaise } from "@pi-dash/shared/money";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";

import { formatReceivedOn } from "@/components/income/contribution-detail-sheet";
import { computeDonorGiving } from "@/components/income/contribution-stats";
import { ContributionStatusBadge } from "@/components/income/contribution-status";

/** How many gifts the sheet lists before pointing to the Income page. */
const RECENT_GIFTS = 8;

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function DonorGivingSection({ partyId }: { partyId: string }) {
  const [gifts, result] = useQuery(queries.contribution.byParty({ partyId }));
  const isLoading = gifts.length === 0 && result.type !== "complete";
  const fy = currentFinancialYear();
  const summary = computeDonorGiving(gifts, fy);

  return (
    <section aria-label="Giving" className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Giving</h3>
        {gifts.length > 0 ? (
          <Link
            className="text-sm underline-offset-4 hover:underline"
            search={{ donor: partyId }}
            to="/income"
          >
            View in Income
          </Link>
        ) : null}
      </div>
      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading giving…</p>
      ) : null}
      {!isLoading && gifts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No contributions recorded yet.
        </p>
      ) : null}
      {gifts.length > 0 ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Fact label="Lifetime" value={formatPaise(summary.lifetimePaise)} />
            <Fact
              label={`This year (${fy.label})`}
              value={formatPaise(summary.yearPaise)}
            />
            <Fact
              label="Last gift"
              value={
                summary.lastGiftOn === null
                  ? "—"
                  : formatReceivedOn(summary.lastGiftOn)
              }
            />
          </div>
          <ul className="divide-y rounded-lg border">
            {gifts.slice(0, RECENT_GIFTS).map((gift) => (
              <li
                className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                key={gift.id}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-mono tabular-nums">
                    {formatPaise(gift.amountPaise)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatReceivedOn(gift.receivedOn)} ·{" "}
                    {
                      CONTRIBUTION_CHANNEL_LABELS[
                        gift.channel as ContributionChannel
                      ]
                    }
                  </span>
                </span>
                <ContributionStatusBadge status={gift.status} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
