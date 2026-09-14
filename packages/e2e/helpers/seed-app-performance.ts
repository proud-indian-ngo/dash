import { writeSync } from "node:fs";

import { eq, sql } from "drizzle-orm";

const id = (number: number) =>
  `019f0000-2191-7000-8000-${number.toString(16).padStart(12, "0")}`;

const counts = {
  teams: 1,
  teamMembers: 1,
  events: 600,
  eventMembers: 601,
  interests: 600,
  updates: 200,
  feedback: 200,
  photos: 200,
  categories: 4,
  vendors: 100,
  reimbursements: 1000,
  reimbursementLineItems: 2000,
  reimbursementHistory: 2000,
  advances: 500,
  advanceLineItems: 1000,
  advanceHistory: 1000,
  vendorPayments: 1000,
  vendorPaymentLineItems: 2000,
  vendorPaymentHistory: 2000,
  transactions: 1000,
  transactionHistory: 2000,
  notifications: 10_000,
} as const;

function assertTestDatabase() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("DATABASE_URL is required");
  const url = new URL(rawUrl);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1"].includes(url.hostname) ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error(
      "Performance fixture requires a local pi-dash-test database"
    );
  }
}

async function batches(
  count: number,
  run: (start: number, length: number) => Promise<unknown>
) {
  for (let start = 0; start < count; start += 250) {
    await run(start, Math.min(250, count - start));
  }
}

export async function seedAppPerformance() {
  assertTestDatabase();
  const adminEmail = process.env.SUPER_ADMIN_EMAIL;
  if (!adminEmail) throw new Error("SUPER_ADMIN_EMAIL is required");
  const volunteerEmail = process.env.VOLUNTEER_EMAIL;
  if (!volunteerEmail) throw new Error("VOLUNTEER_EMAIL is required");

  const { db } = await import("@pi-dash/db");
  const { user } = await import("@pi-dash/db/schema/auth");
  const { team, teamMember } = await import("@pi-dash/db/schema/team");
  const { teamEvent, teamEventMember } =
    await import("@pi-dash/db/schema/team-event");
  const { eventInterest } = await import("@pi-dash/db/schema/event-interest");
  const { eventUpdate } = await import("@pi-dash/db/schema/event-update");
  const { eventFeedback } = await import("@pi-dash/db/schema/event-feedback");
  const { eventPhoto } = await import("@pi-dash/db/schema/event-photo");
  const { notification } = await import("@pi-dash/db/schema/notification");
  const { expenseCategory } =
    await import("@pi-dash/db/schema/expense-category");
  const { reimbursement, reimbursementHistory, reimbursementLineItem } =
    await import("@pi-dash/db/schema/reimbursement");
  const { advancePayment, advancePaymentHistory, advancePaymentLineItem } =
    await import("@pi-dash/db/schema/advance-payment");
  const { vendor, vendorPayment, vendorPaymentHistory, vendorPaymentLineItem } =
    await import("@pi-dash/db/schema/vendor");
  const { vendorPaymentTransaction, vendorPaymentTransactionHistory } =
    await import("@pi-dash/db/schema/vendor-payment-transaction");

  const [admin] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, adminEmail))
    .limit(1);
  if (!admin) throw new Error("Performance fixture requires the seeded admin");
  const [volunteer] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, volunteerEmail))
    .limit(1);
  if (!volunteer) {
    throw new Error("Performance fixture requires the seeded volunteer");
  }

  const ownerId = (index: number) =>
    index % 2 === 0 ? volunteer.id : admin.id;

  const now = new Date("2026-09-14T00:00:00.000Z");
  const day = "2026-09-14";
  const eventId = (index: number) => id(1000 + index);
  const reimbursementId = (index: number) => id(6000 + index);
  const advanceId = (index: number) => id(11_000 + index);
  const paymentId = (index: number) => id(14_000 + index);
  const transactionId = (index: number) => id(19_000 + index);

  await db.transaction(async (tx) => {
    await batches(counts.notifications, (start, length) =>
      tx
        .insert(notification)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(40_000 + index),
              userId: ownerId(index),
              archived: index % 4 < 2,
              read: index % 8 < 4,
              title: `Synthetic notification ${index + 1}`,
              body: "Local performance fixture",
              topicId: "performance",
              idempotencyKey: `performance-2191-${index}`,
              createdAt: new Date(Date.UTC(2191, 0, 1) + index * 1000),
            };
          })
        )
        .onConflictDoNothing({ target: notification.id })
    );
    await tx
      .insert(team)
      .values({
        id: id(1),
        name: "Synthetic performance team 2191",
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({ target: team.id });
    await tx
      .insert(teamMember)
      .values({
        id: id(2),
        teamId: id(1),
        userId: admin.id,
        role: "lead",
        joinedAt: now,
      })
      .onConflictDoNothing({ target: teamMember.id });

    await batches(counts.events, (start, length) =>
      tx
        .insert(teamEvent)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            const startTime = new Date(
              index === 0
                ? Date.UTC(2020, 0, 1, 8)
                : Date.UTC(2191, 0, 1 + Math.floor(index / 4), 8 + (index % 4))
            );
            return {
              id: eventId(index),
              teamId: id(1),
              createdBy: admin.id,
              name: `Synthetic performance event ${index + 1}`,
              city: "bangalore" as const,
              isPublic: index % 2 === 0,
              feedbackEnabled: index === 0,
              startTime,
              endTime: new Date(startTime.getTime() + 60 * 60_000),
              createdAt: now,
              updatedAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: teamEvent.id })
    );
    await batches(counts.eventMembers, (start, length) =>
      tx
        .insert(teamEventMember)
        .values(
          Array.from({ length }, (_, offset) => ({
            id: id(2000 + start + offset),
            eventId: eventId((start + offset) % counts.events),
            userId: start + offset === counts.events ? volunteer.id : admin.id,
            addedAt: now,
          }))
        )
        .onConflictDoNothing({ target: teamEventMember.id })
    );
    await batches(counts.interests, (start, length) =>
      tx
        .insert(eventInterest)
        .values(
          Array.from({ length }, (_, offset) => ({
            id: id(3000 + start + offset),
            eventId: eventId(start + offset),
            userId: admin.id,
            createdAt: now,
            status: "pending" as const,
          }))
        )
        .onConflictDoNothing({ target: eventInterest.id })
    );
    await tx
      .insert(expenseCategory)
      .values(
        Array.from({ length: counts.categories }, (_, index) => ({
          id: id(4000 + index),
          name: `Synthetic performance category 2191-${index + 1}`,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoNothing({ target: expenseCategory.id });
    await tx
      .insert(vendor)
      .values(
        Array.from({ length: counts.vendors }, (_, index) => ({
          id: id(5000 + index),
          name: `Synthetic performance vendor ${index + 1}`,
          bankAccountIfscCode: "TEST0000001",
          bankAccountName: "Synthetic Test Account",
          bankAccountNumber: `000000${String(index + 1).padStart(6, "0")}`,
          contactPhone: `+910000${String(index + 1).padStart(6, "0")}`,
          createdBy: admin.id,
          status: "approved" as const,
          createdAt: now,
          updatedAt: now,
        }))
      )
      .onConflictDoNothing({ target: vendor.id });

    await batches(counts.reimbursements, (start, length) =>
      tx
        .insert(reimbursement)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: reimbursementId(index),
              eventId: eventId(index % counts.events),
              userId: ownerId(index),
              title: `Synthetic reimbursement ${index + 1}`,
              expenseDate: day,
              city: "bangalore" as const,
              status: "pending" as const,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: reimbursement.id })
    );
    await batches(counts.reimbursementLineItems, (start, length) =>
      tx
        .insert(reimbursementLineItem)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(7000 + index),
              reimbursementId: reimbursementId(Math.floor(index / 2)),
              categoryId: id(4000 + (index % counts.categories)),
              amount: "100.00",
              sortOrder: index % 2,
              createdAt: now,
              updatedAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: reimbursementLineItem.id })
    );
    await batches(counts.reimbursementHistory, (start, length) =>
      tx
        .insert(reimbursementHistory)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(9000 + index),
              reimbursementId: reimbursementId(Math.floor(index / 2)),
              actorId: admin.id,
              action:
                index % 2 === 0 ? ("created" as const) : ("submitted" as const),
              createdAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: reimbursementHistory.id })
    );

    await batches(counts.advances, (start, length) =>
      tx
        .insert(advancePayment)
        .values(
          Array.from({ length }, (_, offset) => ({
            id: advanceId(start + offset),
            userId: ownerId(start + offset),
            title: `Synthetic advance ${start + offset + 1}`,
            city: "bangalore" as const,
            status: "pending" as const,
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .onConflictDoNothing({ target: advancePayment.id })
    );
    await batches(counts.advanceLineItems, (start, length) =>
      tx
        .insert(advancePaymentLineItem)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(12_000 + index),
              advancePaymentId: advanceId(Math.floor(index / 2)),
              categoryId: id(4000 + (index % counts.categories)),
              amount: "250.00",
              sortOrder: index % 2,
              createdAt: now,
              updatedAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: advancePaymentLineItem.id })
    );
    await batches(counts.advanceHistory, (start, length) =>
      tx
        .insert(advancePaymentHistory)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(13_000 + index),
              advancePaymentId: advanceId(Math.floor(index / 2)),
              actorId: admin.id,
              action:
                index % 2 === 0 ? ("created" as const) : ("submitted" as const),
              createdAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: advancePaymentHistory.id })
    );

    await batches(counts.vendorPayments, (start, length) =>
      tx
        .insert(vendorPayment)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: paymentId(index),
              eventId: eventId(index % counts.events),
              vendorId: id(5000 + (index % counts.vendors)),
              userId: ownerId(index),
              title: `Synthetic vendor payment ${index + 1}`,
              city: "bangalore" as const,
              status: "pending" as const,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: vendorPayment.id })
    );
    await batches(counts.vendorPaymentLineItems, (start, length) =>
      tx
        .insert(vendorPaymentLineItem)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(15_000 + index),
              vendorPaymentId: paymentId(Math.floor(index / 2)),
              categoryId: id(4000 + (index % counts.categories)),
              amount: "500.00",
              sortOrder: index % 2,
              createdAt: now,
              updatedAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: vendorPaymentLineItem.id })
    );
    await batches(counts.vendorPaymentHistory, (start, length) =>
      tx
        .insert(vendorPaymentHistory)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(17_000 + index),
              vendorPaymentId: paymentId(Math.floor(index / 2)),
              actorId: admin.id,
              action:
                index % 2 === 0 ? ("created" as const) : ("submitted" as const),
              createdAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: vendorPaymentHistory.id })
    );
    await batches(counts.transactions, (start, length) =>
      tx
        .insert(vendorPaymentTransaction)
        .values(
          Array.from({ length }, (_, offset) => ({
            id: transactionId(start + offset),
            vendorPaymentId: paymentId(start + offset),
            userId: ownerId(start + offset),
            amount: "100.00",
            status: "pending" as const,
            transactionDate: now,
            createdAt: now,
            updatedAt: now,
          }))
        )
        .onConflictDoNothing({ target: vendorPaymentTransaction.id })
    );
    await batches(counts.transactionHistory, (start, length) =>
      tx
        .insert(vendorPaymentTransactionHistory)
        .values(
          Array.from({ length }, (_, offset) => {
            const index = start + offset;
            return {
              id: id(20_000 + index),
              vendorPaymentTransactionId: transactionId(Math.floor(index / 2)),
              actorId: admin.id,
              action:
                index % 2 === 0 ? ("created" as const) : ("submitted" as const),
              createdAt: now,
            };
          })
        )
        .onConflictDoNothing({ target: vendorPaymentTransactionHistory.id })
    );
    await tx
      .insert(eventUpdate)
      .values(
        Array.from({ length: counts.updates }, (_, index) => ({
          id: id(30_000 + index),
          eventId: eventId(0),
          createdBy: index % 4 === 3 ? admin.id : volunteer.id,
          content: JSON.stringify([
            {
              type: "p",
              children: [{ text: `Synthetic performance update ${index + 1}` }],
            },
          ]),
          status:
            index % 2 === 0 ? ("approved" as const) : ("pending" as const),
          reviewedBy: index % 2 === 0 ? admin.id : null,
          reviewedAt: index % 2 === 0 ? now : null,
          createdAt: new Date(now.getTime() + index),
          updatedAt: now,
        }))
      )
      .onConflictDoNothing({ target: eventUpdate.id });
    await tx
      .insert(eventFeedback)
      .values(
        Array.from({ length: counts.feedback }, (_, index) => ({
          id: id(31_000 + index),
          eventId: eventId(0),
          content: JSON.stringify([
            {
              type: "p",
              children: [
                { text: `Synthetic performance feedback ${index + 1}` },
              ],
            },
          ]),
          createdAt: new Date(now.getTime() + index),
          updatedAt: now,
        }))
      )
      .onConflictDoNothing({ target: eventFeedback.id });
    await tx
      .insert(eventPhoto)
      .values(
        Array.from({ length: counts.photos }, (_, index) => ({
          id: id(32_000 + index),
          eventId: eventId(0),
          uploadedBy: index % 4 === 3 ? admin.id : volunteer.id,
          caption: `Synthetic performance photo ${index + 1}`,
          status:
            index % 2 === 0 ? ("approved" as const) : ("pending" as const),
          reviewedBy: index % 2 === 0 ? admin.id : null,
          reviewedAt: index % 2 === 0 ? now : null,
          createdAt: new Date(now.getTime() + index),
        }))
      )
      .onConflictDoNothing({ target: eventPhoto.id });
  });

  const ranges = [
    ["teams", team, 1],
    ["teamMembers", teamMember, 2],
    ["events", teamEvent, 1000],
    ["eventMembers", teamEventMember, 2000],
    ["interests", eventInterest, 3000],
    ["updates", eventUpdate, 30_000],
    ["feedback", eventFeedback, 31_000],
    ["photos", eventPhoto, 32_000],
    ["notifications", notification, 40_000],
    ["categories", expenseCategory, 4000],
    ["vendors", vendor, 5000],
    ["reimbursements", reimbursement, 6000],
    ["reimbursementLineItems", reimbursementLineItem, 7000],
    ["reimbursementHistory", reimbursementHistory, 9000],
    ["advances", advancePayment, 11_000],
    ["advanceLineItems", advancePaymentLineItem, 12_000],
    ["advanceHistory", advancePaymentHistory, 13_000],
    ["vendorPayments", vendorPayment, 14_000],
    ["vendorPaymentLineItems", vendorPaymentLineItem, 15_000],
    ["vendorPaymentHistory", vendorPaymentHistory, 17_000],
    ["transactions", vendorPaymentTransaction, 19_000],
    ["transactionHistory", vendorPaymentTransactionHistory, 20_000],
  ] as const;
  const actualCounts: Record<string, number> = {};
  for (const [name, table, first] of ranges) {
    const expected = counts[name];
    const rows = await db.execute(sql`
      SELECT count(*)::integer AS total
      FROM ${table}
      WHERE ${table.id} BETWEEN ${id(first)} AND ${id(first + expected - 1)}
    `);
    const actual = Number(rows[0]?.total);
    if (actual !== expected) {
      throw new Error(`Performance fixture ${name} count mismatch`);
    }
    actualCounts[name] = actual;
  }

  const restrictedOwnerRanges = [
    ["reimbursements", reimbursement, 6000, counts.reimbursements / 2],
    ["advances", advancePayment, 11_000, counts.advances / 2],
    ["vendorPayments", vendorPayment, 14_000, counts.vendorPayments / 2],
    ["transactions", vendorPaymentTransaction, 19_000, counts.transactions / 2],
  ] as const;
  const restrictedCounts: Record<string, number> = {};
  for (const [name, table, first, expected] of restrictedOwnerRanges) {
    const rows = await db.execute(sql`
      SELECT count(*)::integer AS total
      FROM ${table}
      WHERE ${table.id} BETWEEN ${id(first)} AND ${id(first + counts[name] - 1)}
        AND ${table.userId} = ${volunteer.id}
    `);
    const actual = Number(rows[0]?.total);
    if (actual !== expected) {
      throw new Error(`Performance fixture restricted ${name} count mismatch`);
    }
    if (name !== "transactions") restrictedCounts[name] = actual;
  }
  const publicEvents = await db.execute(sql`
    SELECT count(*)::integer AS total
    FROM ${teamEvent}
    WHERE ${teamEvent.id} BETWEEN ${eventId(0)} AND ${eventId(counts.events - 1)}
      AND ${teamEvent.isPublic} = true
  `);
  const accessibleEvents = Number(publicEvents[0]?.total);
  if (accessibleEvents !== counts.events / 2) {
    throw new Error("Performance fixture restricted events count mismatch");
  }
  restrictedCounts.events = accessibleEvents;

  return {
    teamId: id(1),
    counts: actualCounts,
    restrictedCounts,
    notificationIds: {
      admin: Array.from(
        { length: counts.notifications },
        (_, index) => counts.notifications - 1 - index
      )
        .filter((index) => index % 4 === 3)
        .slice(0, 50)
        .map((index) => id(40_000 + index)),
      volunteer: Array.from(
        { length: counts.notifications },
        (_, index) => counts.notifications - 1 - index
      )
        .filter((index) => index % 4 === 2)
        .slice(0, 50)
        .map((index) => id(40_000 + index)),
    },
    sampleIds: {
      ownReimbursement: reimbursementId(0),
      deniedReimbursement: reimbursementId(1),
      ownVendorPayment: paymentId(0),
      deniedVendorPayment: paymentId(1),
      publicEvent: eventId(0),
      privateEvent: eventId(1),
    },
  };
}

if (import.meta.main) {
  const result = await seedAppPerformance();
  writeSync(1, `${JSON.stringify(result)}\n`);
  const { db } = await import("@pi-dash/db");
  await db.$client.end();
}
