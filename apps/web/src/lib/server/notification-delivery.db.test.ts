import { db } from "@pi-dash/db";
import { notificationTopicPreference, user } from "@pi-dash/db/schema/auth";
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
import { env } from "@pi-dash/env/server";
import { MAX_ATTEMPTS } from "@pi-dash/notifications/batching";
import { TOPICS } from "@pi-dash/notifications/topics";
import { sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import {
  queryDeliveries,
  queryDeliveryPreview,
} from "@/lib/server/notification-delivery";

/**
 * The delivery SQL and its status rules against a real database. Opt in with
 * NOTIFICATION_DELIVERY_TEST_DATABASE_URL equal to a local DATABASE_URL;
 * every test transaction is rolled back.
 */
const databaseUrl = process.env.NOTIFICATION_DELIVERY_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  databaseUrl === env.DATABASE_URL &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  }
}

const minutesAgo = (minutes: number) =>
  sql`now() - make_interval(mins => ${minutes}::int)`;

/**
 * One recipient with a phone and one without, and a message on every path
 * the page reads. Keys are unique to the run; titles carry `tag` for search.
 */
async function seed(tx: Tx) {
  const tag = uuidv7();
  const withPhone = uuidv7();
  const noPhone = uuidv7();
  await tx.insert(user).values([
    {
      email: `${withPhone}@delivery.test`,
      id: withPhone,
      name: `Delivery Phone ${tag}`,
      phone: "919800000001",
    },
    { email: `${noPhone}@delivery.test`, id: noPhone, name: "Delivery None" },
  ]);
  const key = (name: string) => `delivery-${name}-${tag}`;
  const inbox = (
    name: string,
    userId: string,
    minutes: number,
    extra: { read?: boolean; suffix?: string; topic?: string } = {}
  ) => ({
    body: `${name} body`,
    createdAt: minutesAgo(minutes),
    id: uuidv7(),
    idempotencyKey: `${key(name)}${extra.suffix ?? "-inbox"}`,
    read: extra.read ?? false,
    title: `${name} ${tag}`,
    topicId: extra.topic ?? TOPICS.TEAMS,
    userId,
  });
  await tx.insert(notification).values([
    // Sent alone: delivered on WhatsApp, email still held.
    inbox("alone", withPhone, 1),
    // Bulk key format, batched into a summary on both channels.
    inbox("summary", withPhone, 2, {
      read: true,
      suffix: `-inbox-${withPhone}`,
    }),
    // Nothing sent on WhatsApp, the recipient has no phone.
    inbox("nophone", noPhone, 3),
    // Nothing sent on WhatsApp, the topic has WhatsApp off.
    inbox("off", withPhone, 4, { topic: TOPICS.EVENTS_SCHEDULE }),
    // Read before the flush, so both channels were skipped.
    inbox("skipped", withPhone, 5, { read: true }),
    // A topic without email.
    inbox("noemail", withPhone, 6, { topic: TOPICS.KALAKRITI_REGISTRATION }),
  ]);
  await tx.insert(notificationTopicPreference).values({
    topicId: TOPICS.EVENTS_SCHEDULE,
    userId: withPhone,
    whatsappEnabled: false,
  });

  const held = ["alone", "summary", "skipped", "inboxoff", "other"];
  await tx.insert(heldNotification).values(
    held.map((name) => ({
      body: "",
      key: key(name),
      title: `${name} ${tag}`,
      topicId: TOPICS.TEAMS,
    }))
  );
  const recipient = (
    name: string,
    channel: "email" | "whatsapp",
    state: {
      attempts?: number;
      batchId?: string | null;
      sent?: boolean;
      skippedRead?: boolean;
    }
  ) => ({
    attempts: state.attempts ?? 0,
    batchId: state.batchId ?? null,
    channel,
    claimedAt: state.batchId ? minutesAgo(1) : null,
    heldKey: key(name),
    sentAt: state.sent ? minutesAgo(1) : null,
    skippedRead: state.skippedRead ?? false,
    topicId: TOPICS.TEAMS,
    userId: withPhone,
  });
  const summaryBatch = `batch-summary-${tag}`;
  await tx.insert(heldNotificationRecipient).values([
    recipient("alone", "email", {}),
    recipient("summary", "email", { batchId: summaryBatch, sent: true }),
    recipient("other", "email", { batchId: summaryBatch, sent: true }),
    recipient("summary", "whatsapp", {
      batchId: `${summaryBatch}-w`,
      sent: true,
    }),
    recipient("skipped", "email", {
      batchId: `skipped-${tag}`,
      sent: true,
      skippedRead: true,
    }),
    recipient("skipped", "whatsapp", {
      batchId: `skipped-${tag}-w`,
      sent: true,
      skippedRead: true,
    }),
    // Inbox off: given up on WhatsApp, dropped by the kill switch on email.
    recipient("inboxoff", "whatsapp", {
      attempts: MAX_ATTEMPTS,
      batchId: `inboxoff-${tag}`,
      sent: true,
    }),
    recipient("inboxoff", "email", { batchId: null, sent: true }),
  ]);
  await tx.insert(whatsappMessage).values([
    {
      idempotencyKey: `${key("alone")}-whatsapp-${withPhone}`,
      params: { team: "Alone" },
      status: "delivered",
      template: "team_added",
      userId: withPhone,
    },
    {
      idempotencyKey: `digest-${summaryBatch}-w-whatsapp`,
      params: { count: "2", summary: "Two things", topic: "Teams" },
      status: "read",
      template: "notifications_summary",
      templateBody: "Stored summary of {{count}}: {{summary}}.",
      userId: withPhone,
    },
    // A notification sent with the inbox off, not batched.
    {
      createdAt: minutesAgo(7),
      idempotencyKey: `${key("direct")}-whatsapp-${withPhone}`,
      status: "failed",
      template: "team_removed",
      userId: withPhone,
    },
    // A WhatsApp-only send that never had an inbox copy.
    {
      createdAt: minutesAgo(8),
      idempotencyKey: `group-invite-${tag}`,
      status: "sent",
      template: "group_invite",
      userId: withPhone,
    },
  ]);
  return { key, noPhone, summaryBatch, tag, withPhone };
}

const PAGE = { limit: 100, offset: 0 };

it.skipIf(!localDatabase)("derives each channel's status in SQL", async () => {
  await inRolledBackTransaction(async (tx) => {
    const { key, noPhone, tag, withPhone } = await seed(tx);
    const { rows, total } = await queryDeliveries(tx, {
      ...PAGE,
      userId: withPhone,
    });
    const byKey = Object.fromEntries(
      rows.map((row) => [
        row.key,
        [row.inbox, row.whatsapp, row.email, row.title, row.topicId],
      ])
    );
    expect(byKey).toEqual({
      [key("alone")]: ["unread", "delivered", "held", `alone ${tag}`, "Teams"],
      [key("summary")]: [
        "read",
        "summary",
        "summary",
        `summary ${tag}`,
        "Teams",
      ],
      [key("off")]: [
        "unread",
        "off",
        "not_tracked",
        `off ${tag}`,
        TOPICS.EVENTS_SCHEDULE,
      ],
      [key("skipped")]: [
        "read",
        "skipped_read",
        "skipped_read",
        `skipped ${tag}`,
        "Teams",
      ],
      [key("noemail")]: [
        "unread",
        "not_sent",
        "none",
        `noemail ${tag}`,
        TOPICS.KALAKRITI_REGISTRATION,
      ],
      [key("inboxoff")]: [
        "off",
        "gave_up",
        "not_sent",
        `inboxoff ${tag}`,
        "Teams",
      ],
      [key("other")]: ["off", "not_sent", "summary", `other ${tag}`, "Teams"],
      [key("direct")]: ["off", "failed", "none", "Removed from a team", null],
      [`group-invite-${tag}`]: [
        "none",
        "sent",
        "none",
        "WhatsApp group invite",
        null,
      ],
    });
    expect(total).toBe(rows.length);

    const nophone = await queryDeliveries(tx, { ...PAGE, userId: noPhone });
    expect(nophone.rows.map((row) => row.whatsapp)).toEqual(["no_whatsapp"]);
  });
});

it.skipIf(!localDatabase)("filters, pages and counts in SQL", async () => {
  await inRolledBackTransaction(async (tx) => {
    const { key, tag, withPhone } = await seed(tx);
    const failed = await queryDeliveries(tx, {
      ...PAGE,
      userId: withPhone,
      whatsapp: "failed",
    });
    expect(failed.total).toBe(1);
    expect(failed.rows.map((row) => row.key)).toEqual([key("direct")]);

    const page = await queryDeliveries(tx, {
      limit: 2,
      offset: 2,
      userId: withPhone,
    });
    expect(page.total).toBe(9);
    expect(page.rows).toHaveLength(2);

    const byTitle = await queryDeliveries(tx, {
      ...PAGE,
      search: `skipped ${tag}`,
    });
    expect(byTitle.rows.map((row) => row.key)).toEqual([key("skipped")]);

    const byName = await queryDeliveries(tx, {
      ...PAGE,
      search: `Delivery Phone ${tag}`,
      topic: TOPICS.TEAMS,
    });
    expect(byName.total).toBe(5);

    const byLabel = await queryDeliveries(tx, {
      ...PAGE,
      search: "group invite",
      userId: withPhone,
    });
    expect(byLabel.rows.map((row) => row.key)).toEqual([`group-invite-${tag}`]);
  });
});

it.skipIf(!localDatabase)(
  "previews the summary a message went in, from the stored body",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { key, withPhone } = await seed(tx);
      // Sent alone by an earlier, failed run: the summary still wins.
      await tx.insert(whatsappMessage).values({
        idempotencyKey: `${key("summary")}-whatsapp-${withPhone}`,
        params: { team: "Earlier" },
        status: "delivered",
        template: "team_added",
        userId: withPhone,
      });
      const preview = await queryDeliveryPreview(tx, {
        key: key("summary"),
        userId: withPhone,
      });
      expect(preview.inbox?.body).toBe("summary body");
      expect(preview.whatsapp?.summary).toBe(true);
      expect(preview.whatsapp?.body).toEqual([
        [{ bold: false, text: "Stored summary of 2: Two things." }],
      ]);

      const alone = await queryDeliveryPreview(tx, {
        key: key("alone"),
        userId: withPhone,
      });
      expect(alone.whatsapp?.summary).toBe(false);
      expect(
        alone.whatsapp?.body
          .flat()
          .map((run) => run.text)
          .join("")
      ).toContain("Alone");
    });
  }
);

it.skipIf(!localDatabase)(
  "reads email status from the delivery log",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { key, summaryBatch, tag, withPhone } = await seed(tx);
      // A held message sent on its own by the flush.
      await tx.insert(notification).values({
        body: "single body",
        createdAt: minutesAgo(9),
        id: uuidv7(),
        idempotencyKey: `${key("single")}-inbox`,
        title: `single ${tag}`,
        topicId: TOPICS.TEAMS,
        userId: withPhone,
      });
      await tx.insert(heldNotification).values({
        body: "",
        key: key("single"),
        title: `single ${tag}`,
        topicId: TOPICS.TEAMS,
      });
      await tx.insert(heldNotificationRecipient).values({
        batchId: `single-${tag}`,
        channel: "email",
        claimedAt: minutesAgo(1),
        heldKey: key("single"),
        sentAt: minutesAgo(1),
        topicId: TOPICS.TEAMS,
        userId: withPhone,
      });
      await tx.insert(emailMessage).values([
        // Sent straight away, then bounced.
        {
          error: "Permanent (General): No mailbox",
          key: key("off"),
          resendEmailId: `email-off-${tag}`,
          status: "bounced",
          userId: withPhone,
        },
        {
          key: key("single"),
          resendEmailId: `email-single-${tag}`,
          userId: withPhone,
        },
        {
          key: `digest-${summaryBatch}`,
          resendEmailId: `email-digest-${tag}`,
          status: "delivered",
          userId: withPhone,
        },
        // A webhook event that beat the send's insert has no key yet.
        { resendEmailId: `email-orphan-${tag}`, status: "delivered" },
      ]);

      const { rows } = await queryDeliveries(tx, {
        ...PAGE,
        userId: withPhone,
      });
      const byKey = new Map(rows.map((row) => [row.key, row]));
      expect(byKey.get(key("off"))?.email).toBe("bounced");
      expect(byKey.get(key("off"))?.emailLog?.error).toBe(
        "Permanent (General): No mailbox"
      );
      expect(byKey.get(key("single"))?.email).toBe("sent");
      expect(byKey.get(key("summary"))?.email).toBe("summary");
      expect(byKey.get(key("summary"))?.emailSummaryLog?.status).toBe(
        "delivered"
      );
      expect(byKey.get(key("other"))?.emailSummaryLog?.status).toBe(
        "delivered"
      );
      expect(byKey.get(key("alone"))?.email).toBe("held");

      const bounced = await queryDeliveries(tx, {
        ...PAGE,
        email: "bounced",
        userId: withPhone,
      });
      expect(bounced.rows.map((row) => row.key)).toEqual([key("off")]);
    });
  }
);

it.skipIf(!localDatabase)(
  "lists GoWA group posts and direct sends with their receipts",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { key, tag, withPhone } = await seed(tx);
      const groupJid = `${tag}@g.us`;
      await tx.insert(whatsappGroup).values({
        createdAt: new Date(),
        id: uuidv7(),
        jid: groupJid,
        name: `Volunteers ${tag}`,
        updatedAt: new Date(),
      });
      const post = uuidv7();
      const direct = uuidv7();
      const failed = uuidv7();
      const viaGateway = uuidv7();
      await tx.insert(gowaMessage).values([
        // A media post: two attachments, two message IDs, one row.
        {
          attachmentCount: 2,
          chatJid: groupJid,
          id: post,
          kind: "group_post",
          source: "weekly_digest",
          text: "This week's events",
        },
        {
          createdAt: minutesAgo(10),
          id: direct,
          kind: "direct",
          source: "scheduled",
          text: "See you Sunday",
          userId: withPhone,
        },
        {
          createdAt: minutesAgo(11),
          error: "All retries exhausted",
          id: failed,
          kind: "direct",
          source: "scheduled",
          text: "Never sent",
          userId: withPhone,
        },
        // A notification sent through GoWA while the Cloud API was off.
        {
          id: viaGateway,
          idempotencyKey: `${key("noemail")}-whatsapp-${withPhone}`,
          kind: "direct",
          source: "notification",
          text: "*No email*\nbody",
          userId: withPhone,
        },
      ]);
      await tx.insert(gowaMessagePart).values([
        { gowaMessageId: post, messageId: `post-a-${tag}` },
        { gowaMessageId: post, messageId: `post-b-${tag}` },
        { gowaMessageId: direct, messageId: `direct-${tag}` },
        { gowaMessageId: viaGateway, messageId: `gateway-${tag}` },
      ]);
      const at = new Date();
      await tx.insert(gowaReceipt).values([
        // A dashboard user who read it.
        {
          deliveredAt: at,
          messageId: `post-a-${tag}`,
          personJid: "919800000001@s.whatsapp.net",
          readAt: at,
        },
        // Someone unknown whose display name is their number.
        {
          deliveredAt: at,
          displayName: "+91 98111 11222",
          messageId: `post-b-${tag}`,
          personJid: "919811111222@s.whatsapp.net",
        },
        // Someone on both attachments, counted once.
        ...["a", "b"].map((part) => ({
          deliveredAt: at,
          displayName: "Ravi",
          messageId: `post-${part}-${tag}`,
          personJid: "251556368777322@lid",
        })),
        {
          deliveredAt: at,
          messageId: `direct-${tag}`,
          personJid: "919800000001@s.whatsapp.net",
        },
        {
          deliveredAt: at,
          messageId: `gateway-${tag}`,
          personJid: "919800000001@s.whatsapp.net",
          readAt: at,
        },
        // A receipt for a message the dashboard never logged.
        {
          deliveredAt: at,
          messageId: `phone-${tag}`,
          personJid: "919800000001@s.whatsapp.net",
        },
      ]);

      const groups = await queryDeliveries(tx, {
        ...PAGE,
        deliveredBy: "whatsapp_group",
        search: `Volunteers ${tag}`,
      });
      expect(groups.rows).toHaveLength(1);
      const [row] = groups.rows;
      expect(row).toMatchObject({
        deliveredBy: "whatsapp_group",
        email: "none",
        gateway: { deliveredCount: 3, kind: "group_post", readCount: 1 },
        inbox: "none",
        key: `gowa-${post}`,
        recipientName: `Volunteers ${tag}`,
        title: "Weekly events digest",
        whatsapp: "sent",
      });

      const { rows } = await queryDeliveries(tx, {
        ...PAGE,
        userId: withPhone,
      });
      const byKey = new Map(rows.map((r) => [r.key, r]));
      expect(byKey.get(`gowa-${direct}`)).toMatchObject({
        deliveredBy: "whatsapp_gateway",
        title: "Scheduled message",
        whatsapp: "delivered",
      });
      expect(byKey.get(`gowa-${failed}`)?.whatsapp).toBe("failed");
      expect(byKey.get(key("noemail"))).toMatchObject({
        deliveredBy: "whatsapp_gateway",
        whatsapp: "read",
      });
      expect(byKey.get(key("alone"))?.deliveredBy).toBe("whatsapp_api");
      expect(byKey.get(key("off"))?.deliveredBy).toBe("none");
      expect(byKey.has(`gowa-${viaGateway}`)).toBe(false);

      const preview = await queryDeliveryPreview(tx, {
        key: `gowa-${post}`,
        userId: null,
      });
      expect(preview.gateway).toMatchObject({
        attachmentCount: 2,
        summary: false,
        text: "This week's events",
      });
      expect(
        preview.gateway?.recipients.map((p) => [p.name, p.readAt !== null])
      ).toEqual([
        ["+91 •••• ••222", false],
        [`Delivery Phone ${tag}`, true],
        ["Ravi", false],
      ]);

      const gateway = await queryDeliveryPreview(tx, {
        key: key("noemail"),
        userId: withPhone,
      });
      expect(gateway.gateway?.text).toBe("*No email*\nbody");
      expect(gateway.gateway?.recipients).toEqual([]);
    });
  }
);
