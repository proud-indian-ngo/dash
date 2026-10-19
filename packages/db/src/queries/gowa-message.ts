import { and, inArray, lt, notExists, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  gowaMessage,
  gowaMessagePart,
  gowaReceipt,
} from "../schema/private/gowa-message";

export type GowaMessageEntry = Omit<
  typeof gowaMessage.$inferInsert,
  "createdAt" | "id"
>;

/**
 * Logs one GoWA send with its WhatsApp message IDs. A retried send that
 * GoWA deduped returns IDs already logged, so it adds nothing.
 */
export async function recordGowaMessage(
  entry: GowaMessageEntry,
  messageIds: string[]
): Promise<void> {
  if (messageIds.length > 0) {
    const logged = await db
      .select({ id: gowaMessagePart.messageId })
      .from(gowaMessagePart)
      .where(inArray(gowaMessagePart.messageId, messageIds))
      .limit(1);
    if (logged.length > 0) {
      return;
    }
  }
  const id = uuidv7();
  await db.transaction(async (tx) => {
    await tx.insert(gowaMessage).values({ ...entry, id });
    if (messageIds.length > 0) {
      await tx
        .insert(gowaMessagePart)
        .values(
          messageIds.map((messageId) => ({ gowaMessageId: id, messageId }))
        )
        .onConflictDoNothing();
    }
  });
}

export interface GowaReceipt {
  at: Date;
  displayName: string | null;
  messageIds: string[];
  personJid: string;
  type: "delivered" | "read";
}

/**
 * Records a receipt for each message ID in one statement. Each timestamp is
 * set once: delivery sets `delivered_at`, a read sets `read_at` and
 * `delivered_at` if it's unset, and repeats change nothing.
 */
export async function recordGowaReceipt(receipt: GowaReceipt): Promise<void> {
  if (receipt.messageIds.length === 0) {
    return;
  }
  const readAt = receipt.type === "read" ? receipt.at : null;
  await db
    .insert(gowaReceipt)
    .values(
      receipt.messageIds.map((messageId) => ({
        deliveredAt: receipt.at,
        displayName: receipt.displayName,
        messageId,
        personJid: receipt.personJid,
        readAt,
      }))
    )
    .onConflictDoUpdate({
      set: {
        deliveredAt: sql`coalesce(${gowaReceipt.deliveredAt}, excluded.delivered_at)`,
        displayName: sql`coalesce(excluded.display_name, ${gowaReceipt.displayName})`,
        readAt: sql`coalesce(${gowaReceipt.readAt}, excluded.read_at)`,
      },
      setWhere: sql`${gowaReceipt.deliveredAt} is null
        or (${gowaReceipt.readAt} is null and excluded.read_at is not null)`,
      target: [gowaReceipt.messageId, gowaReceipt.personJid],
    });
}

/** How long a receipt may wait for its send's row before it's dropped. */
const ORPHAN_RECEIPT_HOURS = 1;

/**
 * The log is for tracing recent delivery; older sends are dropped. Their
 * receipts go with receipts for messages never logged (sent from the phone
 * rather than the dashboard) once no send has claimed them for an hour.
 */
export async function pruneGowaMessages(days = 90): Promise<number> {
  const messages = await db
    .delete(gowaMessage)
    .where(
      lt(gowaMessage.createdAt, sql`now() - make_interval(days => ${days})`)
    )
    .returning({ id: gowaMessage.id });
  await db.delete(gowaReceipt).where(
    and(
      lt(
        gowaReceipt.createdAt,
        sql`now() - make_interval(hours => ${ORPHAN_RECEIPT_HOURS})`
      ),
      notExists(
        db
          .select({ one: sql`1` })
          .from(gowaMessagePart)
          .where(sql`${gowaMessagePart.messageId} = ${gowaReceipt.messageId}`)
      )
    )
  );
  return messages.length;
}
