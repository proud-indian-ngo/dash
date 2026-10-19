import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { notification } from "@pi-dash/db/schema/notification";
import { emailMessage } from "@pi-dash/db/schema/private/email-message";
import {
  heldNotification,
  heldNotificationRecipient,
} from "@pi-dash/db/schema/private/held-notification";
import { whatsappMessage } from "@pi-dash/db/schema/private/whatsapp-message";
import { eq, like, or, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

const minutesAgo = (minutes: number) =>
  sql`now() - make_interval(mins => ${minutes}::int)`;

/**
 * Fixture for the Notification delivery spec: three notifications to a
 * volunteer, keyed under `tag`, as the notify and flush jobs would write
 * them. One delivered on WhatsApp with its email still held, one whose
 * WhatsApp send failed and email bounced, and one that went out in a
 * WhatsApp summary.
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
