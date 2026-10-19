import { env } from "@pi-dash/env/server";
import { eq, inArray, like } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

/**
 * The GoWA log's receipt upsert and prune against a real database. Opt in
 * with GOWA_MESSAGE_TEST_DATABASE_URL equal to a local DATABASE_URL; the
 * queries use the shared client, so each test deletes its own rows.
 */
const databaseUrl = process.env.GOWA_MESSAGE_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  databaseUrl === env.DATABASE_URL &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

const PERSON = "919800000001@s.whatsapp.net";

async function withTag(run: (tag: string) => Promise<void>): Promise<void> {
  // Imported here so the client loads only when opted in.
  const { db } = await import(".");
  const { gowaMessage, gowaReceipt } =
    await import("./schema/private/gowa-message");
  const tag = `test-${uuidv7()}`;
  try {
    await run(tag);
  } finally {
    await db.delete(gowaReceipt).where(like(gowaReceipt.messageId, `${tag}%`));
    await db.delete(gowaMessage).where(eq(gowaMessage.text, tag));
  }
}

async function readReceipt(messageId: string) {
  const { db } = await import(".");
  const { gowaReceipt } = await import("./schema/private/gowa-message");
  const [row] = await db
    .select()
    .from(gowaReceipt)
    .where(inArray(gowaReceipt.messageId, [messageId]));
  return row;
}

const at = (minute: number) => new Date(Date.UTC(2026, 9, 19, 10, minute));

it.skipIf(!localDatabase)("sets each receipt time once", async () => {
  const { recordGowaReceipt } = await import("./queries/gowa-message");
  await withTag(async (tag) => {
    const receipt = {
      displayName: null,
      messageIds: [tag],
      personJid: PERSON,
    };
    await recordGowaReceipt({ ...receipt, at: at(1), type: "delivered" });
    await recordGowaReceipt({ ...receipt, at: at(2), type: "delivered" });
    expect(await readReceipt(tag)).toMatchObject({
      deliveredAt: at(1),
      readAt: null,
    });

    await recordGowaReceipt({ ...receipt, at: at(3), type: "read" });
    await recordGowaReceipt({ ...receipt, at: at(4), type: "read" });
    await recordGowaReceipt({ ...receipt, at: at(5), type: "delivered" });
    expect(await readReceipt(tag)).toMatchObject({
      deliveredAt: at(1),
      readAt: at(3),
    });
  });
});

it.skipIf(!localDatabase)(
  "takes delivery from a read that came first",
  async () => {
    const { recordGowaReceipt } = await import("./queries/gowa-message");
    await withTag(async (tag) => {
      const receipt = {
        displayName: "Asha",
        messageIds: [tag],
        personJid: PERSON,
      };
      await recordGowaReceipt({ ...receipt, at: at(3), type: "read" });
      await recordGowaReceipt({ ...receipt, at: at(1), type: "delivered" });
      expect(await readReceipt(tag)).toMatchObject({
        deliveredAt: at(3),
        displayName: "Asha",
        readAt: at(3),
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "keeps receipts that beat the send, and drops ones no send claims",
  async () => {
    const { db } = await import(".");
    const { gowaReceipt } = await import("./schema/private/gowa-message");
    const { pruneGowaMessages, recordGowaMessage, recordGowaReceipt } =
      await import("./queries/gowa-message");
    await withTag(async (tag) => {
      const sent = `${tag}-sent`;
      const stray = `${tag}-stray`;
      await recordGowaReceipt({
        at: at(1),
        displayName: null,
        messageIds: [sent, stray],
        personJid: PERSON,
        type: "delivered",
      });
      const entry = {
        kind: "direct" as const,
        source: "scheduled" as const,
        text: tag,
      };
      await recordGowaMessage(entry, [sent]);
      // A retry GoWA deduped returns the same ID and logs nothing more.
      await recordGowaMessage(entry, [sent]);
      await db
        .update(gowaReceipt)
        .set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
        .where(like(gowaReceipt.messageId, `${tag}%`));

      await pruneGowaMessages();
      expect(await readReceipt(sent)).toBeDefined();
      expect(await readReceipt(stray)).toBeUndefined();

      const { gowaMessage } = await import("./schema/private/gowa-message");
      const logged = await db
        .select()
        .from(gowaMessage)
        .where(eq(gowaMessage.text, tag));
      expect(logged).toHaveLength(1);
    });
  }
);
