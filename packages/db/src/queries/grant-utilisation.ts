import { GRANT_RECEIPT_STATUSES } from "@pi-dash/shared/grants";
import { assertSafePaise } from "@pi-dash/shared/money";
import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { db } from "..";
import { accountHead } from "../schema/finance-dimensions";
import { grantAgreement } from "../schema/grant";
import { contribution, contributionRefund } from "../schema/income";
import { ledgerEntry } from "../schema/ledger";

/** Money received under a grant: one linked contribution, gross, on its received date. */
export interface GrantReceipt {
  contributionId: string;
  grantId: string;
  paise: number;
  receivedOn: string;
  reference: string | null;
  trancheId: string | null;
}

/** Money given back on a linked contribution, on its own date. */
export interface GrantRefund {
  contributionId: string;
  grantId: string;
  paise: number;
  reference: string | null;
  refundedOn: string;
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
  refunds: GrantRefund[];
  spend: GrantSpend[];
}

/**
 * Server only. What a certificate for `from`..`to` needs, for the given
 * grants (all when `grantIds` is null). Never stored. Every figure is
 * dated, so a later event never changes an earlier range.
 *
 * - Received: contributions linked to the grant that arrived (received,
 *   receipted or refunded; not pending or reversed), gross, by received
 *   date, on or before `to`.
 * - Refunded: refunds of those contributions, by refund date, on or before
 *   `to`.
 * - Spent: cash expense (`medium = 'monetary'`) the books recognise on the
 *   grant's project, per expense head, on or before `to` by economic date.
 *   An entry counts when its economic date is within the grant's period; a
 *   reversal counts when the entry it reverses does, on its own date, so a
 *   void dated after the period still takes the spend off. Spend before
 *   `from` is "before", the rest "within"; with no `from`, all "within".
 */
export async function loadGrantUtilisation(
  reader: Pick<typeof db, "select">,
  range: { from: string | null; grantIds: readonly string[] | null; to: string }
): Promise<GrantUtilisationRows> {
  if (range.grantIds?.length === 0) {
    return { receipts: [], refunds: [], spend: [] };
  }
  const linked = and(
    isNotNull(contribution.grantId),
    range.grantIds
      ? inArray(contribution.grantId, [...range.grantIds])
      : undefined,
    inArray(contribution.status, [...GRANT_RECEIPT_STATUSES])
  );
  const receiptRows = await reader
    .select({
      contributionId: contribution.id,
      grantId: contribution.grantId,
      paise: contribution.amountPaise,
      receivedOn: contribution.receivedOn,
      reference: contribution.reference,
      trancheId: contribution.grantTrancheId,
    })
    .from(contribution)
    .where(and(linked, lte(contribution.receivedOn, range.to)))
    .orderBy(contribution.receivedOn, contribution.id);
  const refundRows = await reader
    .select({
      contributionId: contributionRefund.contributionId,
      grantId: contribution.grantId,
      paise: contributionRefund.amountPaise,
      reference: contributionRefund.reference,
      refundedOn: contributionRefund.refundedOn,
    })
    .from(contributionRefund)
    .innerJoin(
      contribution,
      eq(contribution.id, contributionRefund.contributionId)
    )
    .where(and(linked, lte(contributionRefund.refundedOn, range.to)))
    .orderBy(contributionRefund.refundedOn, contributionRefund.id);

  // The entry a reversal reverses decides whether it falls in the period.
  const original = alias(ledgerEntry, "original");
  const periodDate = sql`coalesce(${original.economicOn}, ${ledgerEntry.economicOn})`;
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
    .leftJoin(original, eq(original.id, ledgerEntry.reversesEntryId))
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
        sql`${periodDate} between ${grantAgreement.startsOn} and ${grantAgreement.endsOn}`
      )
    )
    .where(
      and(
        range.grantIds
          ? inArray(grantAgreement.id, [...range.grantIds])
          : undefined,
        eq(ledgerEntry.medium, "monetary"),
        lte(ledgerEntry.economicOn, range.to)
      )
    )
    .groupBy(grantAgreement.id, ledgerEntry.accountHeadId);

  return {
    receipts: receiptRows.map((row) => ({
      contributionId: row.contributionId,
      grantId: row.grantId as string,
      paise: row.paise,
      receivedOn: row.receivedOn,
      reference: row.reference,
      trancheId: row.trancheId,
    })),
    refunds: refundRows.map((row) => ({
      contributionId: row.contributionId,
      grantId: row.grantId as string,
      paise: row.paise,
      reference: row.reference,
      refundedOn: row.refundedOn,
    })),
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
