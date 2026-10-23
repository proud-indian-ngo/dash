import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  scheduledMessage,
  scheduledMessageRecipient,
} from "@pi-dash/db/schema/scheduled-message";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { eq, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

/**
 * Fixtures for the scheduled-message delivery spec. Every name and JID
 * carries the spec's `tag`. The fake GoWA gateway refuses sends to a JID
 * containing `gowa-fail` (see fake-gowa.ts), so `failGroup` never receives.
 */

const DAY = 24 * 60 * 60 * 1000;

async function userId(email: string) {
  const found = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, email),
  });
  if (!found) {
    throw new Error(`No user ${email}`);
  }
  return found.id;
}

/** Two WhatsApp groups: one the gateway accepts, one it refuses. */
async function groups(tag: string) {
  const now = new Date();
  const ok = { id: uuidv7(), jid: `${tag}-ok@g.us`, name: `${tag} ok group` };
  const fail = {
    id: uuidv7(),
    jid: `${tag}-gowa-fail@g.us`,
    name: `${tag} fail group`,
  };
  await db
    .insert(whatsappGroup)
    .values(
      [ok, fail].map((group) => ({ ...group, createdAt: now, updatedAt: now }))
    );
  return { failGroup: fail, okGroup: ok };
}

interface SeedRecipient {
  group: { id: string; name: string };
  sentAt?: Date;
}

async function insertMessage(
  createdBy: string,
  message: string,
  scheduledAt: Date,
  recipients: SeedRecipient[]
) {
  const id = uuidv7();
  const attachment = {
    fileName: "poster.jpg",
    mimeType: "image/jpeg",
    r2Key: `${process.env.R2_KEY_PREFIX ?? "attachments"}/scheduled-messages/${id}/poster.jpg`,
  };
  await db.insert(scheduledMessage).values({
    attachments: [attachment],
    createdAt: scheduledAt,
    createdBy,
    id,
    message,
    scheduledAt,
    updatedAt: scheduledAt,
  });
  const rows = recipients.map(({ group, sentAt }) => ({
    createdAt: scheduledAt,
    id: uuidv7(),
    label: group.name,
    recipientId: group.id,
    sentAt: sentAt ?? null,
    status: sentAt ? ("sent" as const) : ("pending" as const),
    type: "group" as const,
    updatedAt: scheduledAt,
  }));
  await db
    .insert(scheduledMessageRecipient)
    .values(rows.map((row) => ({ ...row, scheduledMessageId: id })));
  return { attachment, id, rowIds: rows.map((row) => row.id) };
}

/**
 * A message with an image to both groups, due now, with the
 * `send-scheduled-whatsapp` payloads its create mutator would enqueue.
 */
async function withAttachment(email: string, tag: string) {
  const { failGroup, okGroup } = await groups(tag);
  const text = `${tag} poster message`;
  const now = new Date();
  const seeded = await insertMessage(await userId(email), text, now, [
    { group: okGroup },
    { group: failGroup },
  ]);
  const payload = (recipientRowId: string, targetAddress: string) => ({
    attachments: [seeded.attachment],
    enqueuedAt: now.getTime(),
    message: text,
    recipientRowId,
    recipientType: "group",
    scheduledMessageId: seeded.id,
    targetAddress,
  });
  return {
    jobs: [
      payload(seeded.rowIds[0] ?? "", okGroup.jid),
      payload(seeded.rowIds[1] ?? "", failGroup.jid),
    ],
    r2Key: seeded.attachment.r2Key,
    text,
  };
}

/**
 * Two messages whose sends never ran: one scheduled eight days ago (past the
 * seven-day cutoff) with one recipient still pending and one sent, and one
 * scheduled six days ago with its recipient pending.
 */
async function stale(email: string, tag: string) {
  const { okGroup, failGroup } = await groups(tag);
  const createdBy = await userId(email);
  const now = Date.now();
  const old = await insertMessage(
    createdBy,
    `${tag} eight days old`,
    new Date(now - 8 * DAY),
    [{ group: okGroup, sentAt: new Date(now - 8 * DAY) }, { group: failGroup }]
  );
  await insertMessage(
    createdBy,
    `${tag} six days old`,
    new Date(now - 6 * DAY),
    [{ group: failGroup }]
  );
  return {
    oldText: `${tag} eight days old`,
    r2Key: old.attachment.r2Key,
    recentText: `${tag} six days old`,
  };
}

/** Deletion jobs ever queued for an R2 key. */
async function deleteJobs(r2Key: string) {
  const rows = await db.execute<{ total: number }>(
    sql`select count(*)::int as total from pgboss.job
        where name = 'delete-r2-object' and data::text like ${`%${r2Key}%`}`
  );
  return { total: rows[0]?.total ?? 0 };
}

const [action, first = "", second = ""] = process.argv.slice(2);
let result: unknown;
if (action === "groups") {
  result = await groups(first);
} else if (action === "with-attachment") {
  result = await withAttachment(first, second);
} else if (action === "stale") {
  result = await stale(first, second);
} else if (action === "delete-jobs") {
  result = await deleteJobs(first);
} else {
  throw new Error(`Unsupported scheduled delivery action: ${action ?? ""}`);
}
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exit(0);
