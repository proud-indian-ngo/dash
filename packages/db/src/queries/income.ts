import { CONTRIBUTION_EXCLUDED_STATUSES } from "@pi-dash/shared/income";
import { and, eq, gte, isNull, lte, notInArray, or, sql } from "drizzle-orm";

import { db } from "..";
import { contribution } from "../schema/income";
import { partyPrivate } from "../schema/private/party-private";

/**
 * Donors who gave in a date range but whose private details would not pass
 * the donation statement (Form 113): no ID type, no ID number, or no address.
 * Returns party IDs only; the details themselves never leave the server.
 */
export async function listDonorsMissingFilingDetails(range: {
  endsOn: string;
  startsOn: string;
}): Promise<string[]> {
  const rows = await db
    .selectDistinct({ partyId: contribution.partyId })
    .from(contribution)
    .leftJoin(partyPrivate, eq(partyPrivate.partyId, contribution.partyId))
    .where(
      and(
        gte(contribution.receivedOn, range.startsOn),
        lte(contribution.receivedOn, range.endsOn),
        notInArray(contribution.status, [...CONTRIBUTION_EXCLUDED_STATUSES]),
        or(
          isNull(partyPrivate.partyId),
          eq(partyPrivate.idType, "none"),
          isNull(partyPrivate.idNumberEncrypted),
          sql`coalesce(trim(${partyPrivate.addressLine1}), '') = ''`
        )
      )
    )
    .orderBy(contribution.partyId);
  return rows.map((row) => row.partyId);
}
