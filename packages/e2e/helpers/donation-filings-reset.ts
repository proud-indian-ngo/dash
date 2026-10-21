import { db } from "@pi-dash/db";
import {
  donationCertificate,
  donationFiling,
  donationFilingGift,
  donationFilingRow,
} from "@pi-dash/db/schema/private/donation-filings";

/**
 * Removes every donations return filing from the test database. A filing
 * freezes every ready gift of the year, so runs start from none (seeding)
 * and the filings spec starts each attempt from none. Test database only.
 */
export async function removeDonationFilings(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(donationCertificate);
    await tx.delete(donationFilingGift);
    await tx.delete(donationFilingRow);
    await tx.delete(donationFiling);
  });
}
