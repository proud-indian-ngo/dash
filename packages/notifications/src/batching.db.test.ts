import { user } from "@pi-dash/db/schema/auth";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "@pi-dash/db/schema/index";
import {
  heldNotification,
  heldNotificationRecipient,
} from "@pi-dash/db/schema/private/held-notification";
import { SQL } from "bun";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

/**
 * `writeHeldNotification` against the real conflict clauses. Opt in with
 * HELD_NOTIFICATION_TEST_DATABASE_URL pointing at a local database; every
 * test transaction is rolled back.
 */
const databaseUrl = process.env.HELD_NOTIFICATION_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Database = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await run(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

/** Holds a message for a new user, then marks it sent and cleared. */
async function sentHold(tx: Tx) {
  // Imported here so the module's env and client load only when opted in.
  const { writeHeldNotification } = await import("./batching");
  const userId = uuidv7();
  await tx.insert(user).values({
    email: `${userId}@held-notification.test`,
    id: userId,
    name: "Held notification test",
  });
  const input = {
    body: "You were added to Teaching",
    idempotencyKey: `team-member-added-${uuidv7()}`,
    recipients: [{ channel: "email" as const, userId }],
    title: "Added to a team",
    topic: "teams",
    whatsappText: "You were added to Teaching",
  };
  await writeHeldNotification(tx, input);
  await tx
    .update(heldNotificationRecipient)
    .set({
      attempts: 1,
      batchId: "batch-1",
      claimedAt: sql`now() - interval '3 days'`,
      sentAt: sql`now() - interval '3 days'`,
    })
    .where(eq(heldNotificationRecipient.heldKey, input.idempotencyKey));
  await tx
    .update(heldNotification)
    .set({ body: "", clearedAt: sql`now()`, whatsappText: null })
    .where(eq(heldNotification.key, input.idempotencyKey));
  return { input, writeHeldNotification };
}

it.skipIf(!localDatabase)(
  "a retried hold leaves a sent recipient sent",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { input, writeHeldNotification } = await sentHold(tx);
      await writeHeldNotification(tx, input);
      const [recipient] = await tx
        .select({
          attempts: heldNotificationRecipient.attempts,
          batchId: heldNotificationRecipient.batchId,
          sentAt: heldNotificationRecipient.sentAt,
        })
        .from(heldNotificationRecipient)
        .where(eq(heldNotificationRecipient.heldKey, input.idempotencyKey));
      expect(recipient).toMatchObject({ attempts: 1, batchId: "batch-1" });
      expect(recipient?.sentAt).not.toBeNull();
      const [parent] = await tx
        .select({
          body: heldNotification.body,
          clearedAt: heldNotification.clearedAt,
        })
        .from(heldNotification)
        .where(eq(heldNotification.key, input.idempotencyKey));
      expect(parent).toEqual({ body: input.body, clearedAt: null });
    });
  }
);
