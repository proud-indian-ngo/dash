import { env } from "@pi-dash/env/server";
import { inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

/**
 * The email delivery log's conflict clauses against a real database. Opt in
 * with EMAIL_MESSAGE_TEST_DATABASE_URL equal to a local DATABASE_URL; the
 * queries use the shared client, so each test deletes its own rows.
 */
const databaseUrl = process.env.EMAIL_MESSAGE_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  databaseUrl === env.DATABASE_URL &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

async function withRows(
  run: (ids: { a: string; b: string }) => Promise<void>
): Promise<void> {
  // Imported here so the client loads only when opted in.
  const { db } = await import(".");
  const { emailMessage } = await import("./schema/private/email-message");
  const ids = { a: `test-${uuidv7()}`, b: `test-${uuidv7()}` };
  try {
    await run(ids);
  } finally {
    await db
      .delete(emailMessage)
      .where(inArray(emailMessage.resendEmailId, [ids.a, ids.b]));
  }
}

async function readRow(id: string) {
  const { db } = await import(".");
  const { emailMessage } = await import("./schema/private/email-message");
  const [row] = await db
    .select()
    .from(emailMessage)
    .where(inArray(emailMessage.resendEmailId, [id]));
  return row;
}

it.skipIf(!localDatabase)("moves status forward only", async () => {
  const { recordEmailEvent, recordEmailMessages } =
    await import("./queries/email-message");
  await withRows(async ({ a }) => {
    await recordEmailMessages([{ key: "k", resendEmailId: a, userId: null }]);
    await recordEmailEvent({
      error: null,
      resendEmailId: a,
      status: "delivered",
    });
    await recordEmailEvent({
      error: null,
      resendEmailId: a,
      status: "delayed",
    });
    await recordEmailEvent({ error: null, resendEmailId: a, status: "sent" });
    expect((await readRow(a))?.status).toBe("delivered");

    await recordEmailEvent({
      error: null,
      resendEmailId: a,
      status: "complained",
    });
    await recordEmailEvent({
      error: "Permanent (General): x",
      resendEmailId: a,
      status: "bounced",
    });
    expect(await readRow(a)).toMatchObject({
      error: null,
      status: "complained",
    });
  });
});

it.skipIf(!localDatabase)(
  "keeps a status that beat the send's insert, and a retried insert",
  async () => {
    const { recordEmailEvent, recordEmailMessages } =
      await import("./queries/email-message");
    await withRows(async ({ a, b }) => {
      await recordEmailEvent({
        error: null,
        resendEmailId: a,
        status: "delivered",
      });
      expect(await readRow(a)).toMatchObject({
        key: null,
        status: "delivered",
      });

      await recordEmailMessages([
        { key: "k", resendEmailId: a, userId: null },
        { key: "k", resendEmailId: b, userId: null },
      ]);
      // A retried job Resend deduped gets the same ids back.
      await recordEmailMessages([{ key: "k", resendEmailId: b, userId: null }]);
      expect(await readRow(a)).toMatchObject({ key: "k", status: "delivered" });
      expect(await readRow(b)).toMatchObject({ key: "k", status: "sent" });
    });
  }
);
