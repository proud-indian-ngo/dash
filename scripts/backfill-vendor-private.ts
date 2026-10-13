/**
 * Encrypt vendor contact, PAN and bank details left in
 * `private.vendor_legacy_details` by migration 0116 into `party_private` and
 * `party_bank_account`, then delete the legacy rows.
 *
 * Usage:
 *   bun run vendors:backfill-private
 *
 * Needs DATA_ENCRYPTION_KEY. Safe to run again; processed rows are gone.
 */
import { backfillVendorPrivate } from "@pi-dash/db/queries/vendor-party";

const result = await backfillVendorPrivate();
process.stdout.write(
  `Vendor private details: ${result.migrated} migrated, ${result.skipped} skipped (newer details already stored)\n`
);
process.exit(0);
