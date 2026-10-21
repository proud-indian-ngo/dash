import { CONTRIBUTION_RECEIVED_STATUSES } from "@pi-dash/shared/income";
import { assertSafePaise } from "@pi-dash/shared/money";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";

import type { db } from "..";
import { accountHead } from "../schema/finance-dimensions";
import { grantAgreement } from "../schema/grant";
import { contribution, contributionRefund } from "../schema/income";
import { ledgerEntry } from "../schema/ledger";

/** Money received under a grant: one linked contribution, net of its refunds. */
export interface GrantReceipt {
  contributionId: string;
  grantId: string;
  paise: number;
  receivedOn: string;
  reference: string | null;
  trancheId: string | null;
}

/** A grant's spend on one expense head, before the range or within it. */
export interface GrantSpend {
  accountHeadId: string;
  grantId: string;
  paise: number;
  period: "before" | "within";
}

export interface GrantUtilisationRows {
  receipts: GrantReceipt[];
  spend: GrantSpend[];
}

/**
 * Server only. What a certificate for `from`..`to` needs, for the given
 * grants (all when `grantIds` is null). Never stored.
 *
 * - Received: contributions linked to the grant whose status counts as
 *   received, on or before `to`, each net of its refunds (as
 *   `netReceivedPaise`). A pending or reversed gift is not money received.
 * - Spent: the expense the books recognise on the grant's project, by
 *   economic date within the grant's start and end dates and on or before
 *   `to`, per expense head and net of reversals (the same entries as
 *   `loadBudgetActuals`). Spend before `from` is "before", the rest
 *   "within"; with no `from`, it is all "within".
 */
export async function loadGrantUtilisation(
  reader: Pick<typeof db, "select">,
  range: { from: string | null; grantIds: readonly string[] | null; to: string }
): Promise<GrantUtilisationRows> {
  if (range.grantIds?.length === 0) {
    return { receipts: [], spend: [] };
  }
  const refunded = reader
    .select({
      contributionId: contributionRefund.contributionId,
      paise: sql<string>`sum(${contributionRefund.amountPaise})`.as("paise"),
    })
    .from(contributionRefund)
    .groupBy(contributionRefund.contributionId)
    .as("refunded");
  const receiptRows = await reader
    .select({
      contributionId: contribution.id,
      grantId: contribution.grantId,
      paise: sql<string>`greatest(0, ${contribution.amountPaise} - coalesce(${refunded.paise}, 0))`,
      receivedOn: contribution.receivedOn,
      reference: contribution.reference,
      trancheId: contribution.grantTrancheId,
    })
    .from(contribution)
    .leftJoin(refunded, eq(refunded.contributionId, contribution.id))
    .where(
      and(
        isNotNull(contribution.grantId),
        range.grantIds
          ? inArray(contribution.grantId, [...range.grantIds])
          : undefined,
        inArray(contribution.status, [...CONTRIBUTION_RECEIVED_STATUSES]),
        lte(contribution.receivedOn, range.to)
      )
    )
    .orderBy(contribution.receivedOn, contribution.id);

  const amount = sql`case when ${ledgerEntry.effect} = 'increase' then ${ledgerEntry.amountPaise} else -${ledgerEntry.amountPaise} end`;
  const isBefore = range.from
    ? sql`${ledgerEntry.economicOn} < ${range.from}`
    : sql`false`;
  const spendRows = await reader
    .select({
      accountHeadId: ledgerEntry.accountHeadId,
      before: sql<string>`sum(case when ${isBefore} then ${amount} else 0 end)`,
      grantId: grantAgreement.id,
      within: sql<string>`sum(case when ${isBefore} then 0 else ${amount} end)`,
    })
    .from(ledgerEntry)
    .innerJoin(
      accountHead,
      and(
        eq(accountHead.id, ledgerEntry.accountHeadId),
        eq(accountHead.type, "expense")
      )
    )
    .innerJoin(
      grantAgreement,
      and(
        eq(grantAgreement.projectId, ledgerEntry.projectId),
        gte(ledgerEntry.economicOn, grantAgreement.startsOn),
        lte(ledgerEntry.economicOn, grantAgreement.endsOn)
      )
    )
    .where(
      and(
        range.grantIds
          ? inArray(grantAgreement.id, [...range.grantIds])
          : undefined,
        lte(ledgerEntry.economicOn, range.to)
      )
    )
    .groupBy(grantAgreement.id, ledgerEntry.accountHeadId);

  return {
    receipts: receiptRows
      .map((row) => ({
        contributionId: row.contributionId,
        grantId: row.grantId as string,
        paise: assertSafePaise(Number(row.paise)),
        receivedOn: row.receivedOn,
        reference: row.reference,
        trancheId: row.trancheId,
      }))
      .filter((row) => row.paise > 0),
    spend: spendRows.flatMap((row) =>
      (["before", "within"] as const)
        .map((period) => ({
          accountHeadId: row.accountHeadId,
          grantId: row.grantId,
          paise: assertSafePaise(Number(row[period])),
          period,
        }))
        .filter((line) => line.paise !== 0)
    ),
  };
}
