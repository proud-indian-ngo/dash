/**
 * Encrypt vendor contact, PAN and bank details left in
 * `private.vendor_legacy_details` by migration 0116 into `party_private` and
 * `party_bank_account`, then delete the legacy rows.
 *
 * Usage:
 *   bun run vendors:backfill-private [--yes]
 *
 * Needs DATA_ENCRYPTION_KEY, and it must be the key the app uses with this
 * database: the run stops if the key opens none of the encrypted values
 * already stored. Prints the target database and, unless it is local, needs
 * --yes or a typed "yes". Safe to run again; processed rows are gone.
 */
import { confirmDatabaseTarget } from "@pi-dash/db/database-target";
import { KeyMismatchError } from "@pi-dash/db/queries/secrets-rekey";
import { backfillVendorPrivate } from "@pi-dash/db/queries/vendor-party";
import { env } from "@pi-dash/env/server";

if (
  !confirmDatabaseTarget(
    env.DATABASE_URL,
    process.argv.slice(2),
    "Vendor private details backfill"
  )
) {
  process.exit(1);
}

let result: Awaited<ReturnType<typeof backfillVendorPrivate>>;
try {
  result = await backfillVendorPrivate();
} catch (error) {
  if (error instanceof KeyMismatchError) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
  throw error;
}
process.stdout.write(
  `Vendor private details: ${result.migrated} migrated, ${result.skipped} skipped (newer details already stored)\n`
);
process.exit(0);
