/**
 * Backfill missing `account` rows for migrated users.
 *
 * Creates a "credential" provider account (no password) for every user
 * that doesn't already have one, so they can use "Forgot Password" to
 * set a password and sign in.
 *
 * Usage:
 *   DATABASE_URL=postgres://... bun run scripts/backfill-accounts.ts
 */
import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";

// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "../src/schema";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  process.stderr.write(
    "DATABASE_URL env var is required.\nUsage: DATABASE_URL=postgres://... bun run scripts/backfill-accounts.ts\n"
  );
  process.exit(1);
}

const db = drizzle(DATABASE_URL, { schema });
const log = (msg: string) => process.stdout.write(`${msg}\n`);

async function main() {
  // Find users that have no account row at all
  const usersWithoutAccount = await db
    .select({
      id: schema.user.id,
      createdAt: schema.user.createdAt,
      updatedAt: schema.user.updatedAt,
    })
    .from(schema.user)
    .leftJoin(schema.account, eq(schema.user.id, schema.account.userId))
    .where(isNull(schema.account.id));

  log(`Found ${usersWithoutAccount.length} users without an account row.`);

  if (usersWithoutAccount.length === 0) {
    log("Nothing to do.");
    return;
  }

  let created = 0;
  for (const u of usersWithoutAccount) {
    await db.insert(schema.account).values({
      id: uuidv7(),
      accountId: u.id,
      providerId: "credential",
      userId: u.id,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    });
    created++;
  }

  log(
    `Created ${created} account rows. Users can now use "Forgot Password" to sign in.`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FAILED: ${message}\n`);
  process.exit(1);
});
