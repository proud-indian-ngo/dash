import {
  assessReturn,
  missingDonorDetailsPartyIds,
} from "@pi-dash/shared/donations-return";

import { loadReturnFacts } from "./donations-return";

/**
 * Donors whose details would hold up the donations return (Form 113) for a
 * financial year, through the same rules as the readiness page: donors with
 * a gift in the return that lack an ID number, and every donor with a
 * received gift (net of refunds) who lacks a name or address, even one who
 * doesn't want a tax certificate. Returns party IDs only; the details
 * themselves never leave the server.
 */
export async function listDonorsMissingFilingDetails(range: {
  endsOn: string;
  startsOn: string;
}): Promise<string[]> {
  const facts = await loadReturnFacts(range, "none");
  const { gifts } = assessReturn(facts.gifts, facts.donors);
  return missingDonorDetailsPartyIds(gifts);
}
