import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { bankAccount } from "@pi-dash/db/schema/bank-account";
import { and, eq, isNull, ne, or } from "drizzle-orm";

/**
 * Puts a test user's bank accounts back to the seed: removes every other
 * account and makes the seeded one (number ending 7890, see
 * seed-test-user.ts) the default. Run with Bun as a script because
 * Playwright's Node runner cannot load `@pi-dash/db`. Prints one JSON value.
 */
const SEED_ACCOUNT_NUMBER = "1234567890";

const [email = ""] = process.argv.slice(2);
const [owner] = await db
  .select({ id: user.id })
  .from(user)
  .where(eq(user.email, email));
if (!owner) {
  throw new Error(`Test user ${email} not found`);
}
const removed = await db.transaction(async (tx) => {
  const rows = await tx
    .delete(bankAccount)
    .where(
      and(
        eq(bankAccount.userId, owner.id),
        or(
          isNull(bankAccount.accountNumber),
          ne(bankAccount.accountNumber, SEED_ACCOUNT_NUMBER)
        )
      )
    )
    .returning({ id: bankAccount.id });
  const [seeded] = await tx
    .update(bankAccount)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(bankAccount.userId, owner.id),
        eq(bankAccount.accountNumber, SEED_ACCOUNT_NUMBER)
      )
    )
    .returning({ id: bankAccount.id });
  if (!seeded) {
    throw new Error(`Seeded bank account for ${email} not found`);
  }
  return rows.length;
});
await new Promise<void>((resolve, reject) => {
  process.stdout.write(`${JSON.stringify({ removed })}\n`, (error) =>
    error ? reject(error) : resolve()
  );
});
await db.$client.end();
process.exit(0);
