import {
  CONTRIBUTION_RECEIVED_STATUSES,
  netReceivedPaise,
} from "@pi-dash/shared/income";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "..";
import { contribution, contributionRefund } from "../schema/income";
import { partyPrivate } from "../schema/private/party-private";

/**
 * Donors with money received in a date range (net of refunds, through the
 * same `netReceivedPaise` as the Income stats, so pending, refunded,
 * reversed and wholly refunded gifts do not count) whose private details
 * would not pass the donation statement (Form 113): no ID type, no ID
 * number, or no address. Returns party IDs only; the details themselves
 * never leave the server.
 */
export async function listDonorsMissingFilingDetails(range: {
  endsOn: string;
  startsOn: string;
}): Promise<string[]> {
  const rows = await db
    .select({
      amountPaise: contribution.amountPaise,
      partyId: contribution.partyId,
      refundedPaise: sql<string>`(
        select coalesce(sum(${contributionRefund.amountPaise}), 0)
        from ${contributionRefund}
        where ${contributionRefund.contributionId} = ${contribution.id}
      )`,
      status: contribution.status,
    })
    .from(contribution)
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, contribution.partyId))
    .where(
      and(
        gte(contribution.receivedOn, range.startsOn),
        lte(contribution.receivedOn, range.endsOn),
        inArray(contribution.status, [...CONTRIBUTION_RECEIVED_STATUSES]),
        or(
          isNull(partyPrivate.partyId),
          eq(partyPrivate.idType, "none"),
          isNull(partyPrivate.idNumberEncrypted),
          sql`coalesce(trim(${partyPrivate.addressLine1}), '') = ''`
        )
      )
    )
    .orderBy(contribution.partyId);
  const partyIds = new Set<string>();
  for (const row of rows) {
    const net = netReceivedPaise({
      amountPaise: row.amountPaise,
      refunds: [{ amountPaise: Number(row.refundedPaise) }],
      status: row.status,
    });
    if (net > 0) {
      partyIds.add(row.partyId);
    }
  }
  return [...partyIds];
}
