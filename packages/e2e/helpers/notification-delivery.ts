import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { notification } from "@pi-dash/db/schema/notification";
import { emailMessage } from "@pi-dash/db/schema/private/email-message";
import {
  gowaMessage,
  gowaMessagePart,
  gowaReceipt,
} from "@pi-dash/db/schema/private/gowa-message";
import {
  heldNotification,
  heldNotificationRecipient,
} from "@pi-dash/db/schema/private/held-notification";
import { whatsappMessage } from "@pi-dash/db/schema/private/whatsapp-message";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { eq, like, or, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const minutesAgo = (minutes: number) =>
  sql`now() - make_interval(mins => ${minutes}::int)`;

/**
 * The seeded group's name. It doesn't contain `tag`, so searching for the
 * tag finds only the notifications.
 */
function groupName(tag: string): string {
  return `Spec group ${tag.replace("delivery", "group")}`;
}

/**
 * A GoWA group post with receipts from two people: one read it, one has it
 * delivered, and their display name is their number.
 */
async function seedGroupPost(tag: string) {
  const jid = `${tag}@g.us`;
  const now = new Date();
  await db.insert(whatsappGroup).values({
    createdAt: now,
    id: uuidv7(),
    jid,
    name: groupName(tag),
    updatedAt: now,
  });
  const id = uuidv7();
  await db.insert(gowaMessage).values({
    chatJid: jid,
    id,
    kind: "group_post",
    source: "weekly_digest",
    text: `${tag} this week's events`,
  });
  await db
    .insert(gowaMessagePart)
    .values({ gowaMessageId: id, messageId: `${tag}-post` });
  await db.insert(gowaReceipt).values([
    {
      deliveredAt: now,
      displayName: "Spec Reader",
      messageId: `${tag}-post`,
      personJid: "919800000900@s.whatsapp.net",
      readAt: now,
    },
    {
      deliveredAt: now,
      displayName: "+91 98000 00901",
      messageId: `${tag}-post`,
      personJid: "919800000901@s.whatsapp.net",
    },
  ]);
}

/**
 * Fixture for the Notification delivery spec: three notifications to a
 * volunteer, keyed under `tag`, as the notify and flush jobs would write
 * them. One delivered on WhatsApp with its email still held, one whose
 * WhatsApp send failed and email bounced, and one that went out in a
 * WhatsApp summary. Then a GoWA group post.
 */
async function seed(email: string, tag: string) {
  const [recipient] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  if (!recipient) {
    throw new Error(`No user ${email}`);
  }
  const userId = recipient.id;
  const inbox = (name: string, title: string, minutes: number) => ({
    body: `Inbox body for ${name} from the Notification delivery spec.`,
    createdAt: minutesAgo(minutes),
    id: uuidv7(),
    idempotencyKey: `${tag}-${name}-inbox`,
    title: `${title} ${tag}`,
    topicId: "Teams",
    userId,
  });
  await db
    .insert(notification)
    .values([
      inbox("main", "Delivery check", 1),
      inbox("failed", "Delivery failed", 2),
      inbox("summary", "Delivery summary", 3),
    ]);
  await db.insert(whatsappMessage).values([
    {
      idempotencyKey: `${tag}-main-whatsapp-${userId}`,
      params: { team: "Delivery Spec Team" },
      status: "delivered",
      template: "team_added",
      userId,
      wamid: `wamid.${tag}-main`,
    },
    {
      error: "131026: Message undeliverable",
      idempotencyKey: `${tag}-failed-whatsapp-${userId}`,
      params: { team: "Delivery Spec Team" },
      status: "failed",
      template: "team_added",
      userId,
      wamid: `wamid.${tag}-failed`,
    },
    {
      idempotencyKey: `digest-${tag}-batch-whatsapp`,
      params: { count: "2", summary: "Two updates", topic: "Teams" },
      status: "delivered",
      template: "notifications_summary",
      userId,
      wamid: `wamid.${tag}-summary`,
    },
  ]);
  await db.insert(emailMessage).values({
    error: "Permanent (General): Mailbox does not exist",
    key: `${tag}-failed`,
    resendEmailId: `${tag}-failed-email`,
    status: "bounced",
    userId,
  });
  await db.insert(heldNotification).values(
    ["main", "summary"].map((name) => ({
      body: "",
      key: `${tag}-${name}`,
      title: name,
      topicId: "Teams",
    }))
  );
  await db.insert(heldNotificationRecipient).values([
    {
      channel: "email",
      heldKey: `${tag}-main`,
      topicId: "Teams",
      userId,
    },
    {
      batchId: `${tag}-batch`,
      channel: "whatsapp",
      claimedAt: minutesAgo(1),
      heldKey: `${tag}-summary`,
      sentAt: minutesAgo(1),
      topicId: "Teams",
      userId,
    },
  ]);
  await seedGroupPost(tag);
}

async function clear(tag: string) {
  await db
    .delete(notification)
    .where(like(notification.idempotencyKey, `${tag}-%`));
  await db
    .delete(heldNotification)
    .where(like(heldNotification.key, `${tag}-%`));
  await db.delete(emailMessage).where(like(emailMessage.key, `${tag}-%`));
  await db
    .delete(whatsappMessage)
    .where(
      or(
        like(whatsappMessage.idempotencyKey, `${tag}-%`),
        eq(whatsappMessage.idempotencyKey, `digest-${tag}-batch-whatsapp`)
      )
    );
  await db.delete(gowaMessage).where(like(gowaMessage.text, `${tag} %`));
  await db.delete(gowaReceipt).where(like(gowaReceipt.messageId, `${tag}-%`));
  await db.delete(whatsappGroup).where(eq(whatsappGroup.jid, `${tag}@g.us`));
}

const [action, ...args] = process.argv.slice(2);
if (action === "seed") {
  const [email = "", tag = ""] = args;
  await seed(email, tag);
} else if (action === "clear") {
  await clear(args[0] ?? "");
} else {
  throw new Error(`Unsupported notification delivery action: ${action ?? ""}`);
}
process.exit(0);
