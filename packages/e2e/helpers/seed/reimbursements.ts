import { db } from "@pi-dash/db";
import {
  reimbursement,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import {
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { COST_CENTRE_IDS } from "@pi-dash/shared/constants";
import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { log, SEED_REIMBURSEMENT_ID, SEED_VENDOR_ID } from "./core";

const SEED_UPCOMING_REIMBURSEMENT_ID = "e2e00000-0000-0000-0000-000000000002";
const SEED_EXPORT_VENDOR_PAYMENT_ID = "e2e00000-0000-0000-0000-000000000007";

export async function ensureReimbursement(
  userId: string,
  eventId?: string
): Promise<void> {
  const existing = await db.query.reimbursement.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_REIMBURSEMENT_ID),
  });
  if (existing) {
    if (eventId && existing.eventId !== eventId) {
      await db
        .update(reimbursement)
        .set({ eventId })
        .where(eq(reimbursement.id, SEED_REIMBURSEMENT_ID));
    }
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  if (!category) {
    log("Skipping reimbursement seed — no expense categories found");
    return;
  }

  const now = new Date();
  await db.insert(reimbursement).values({
    chargedTo: "event",
    createdAt: now,
    eventId,
    expenseDate: "2026-01-15",
    id: SEED_REIMBURSEMENT_ID,
    status: "pending",
    title: "E2E Seed Reimbursement",
    updatedAt: now,
    userId,
  });

  await db.insert(reimbursementLineItem).values([
    {
      amountPaise: 25000,
      categoryId: category.id,
      createdAt: now,
      description: "Bus fare",
      generateVoucher: true,
      id: uuidv7(),
      reimbursementId: SEED_REIMBURSEMENT_ID,
      sortOrder: 0,
      updatedAt: now,
    },
    {
      amountPaise: 15000,
      categoryId: category.id,
      createdAt: now,
      description: "Lunch",
      generateVoucher: true,
      id: uuidv7(),
      reimbursementId: SEED_REIMBURSEMENT_ID,
      sortOrder: 1,
      updatedAt: now,
    },
  ]);

  log("Created seed reimbursement with 2 line items");
}

export async function ensureUpcomingEventReimbursement(
  userId: string,
  eventId: string
): Promise<void> {
  const existing = await db.query.reimbursement.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_UPCOMING_REIMBURSEMENT_ID),
  });
  if (existing) {
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  if (!category) {
    log("Skipping upcoming event reimbursement seed — no categories found");
    return;
  }

  const now = new Date();
  await db.insert(reimbursement).values({
    chargedTo: "event",
    createdAt: now,
    eventId,
    expenseDate: "2026-01-15",
    id: SEED_UPCOMING_REIMBURSEMENT_ID,
    status: "approved",
    title: "E2E Upcoming Event Reimbursement",
    updatedAt: now,
    userId,
  });

  await db.insert(reimbursementLineItem).values({
    amountPaise: 27500,
    categoryId: category.id,
    createdAt: now,
    description: "Upcoming event supplies",
    generateVoucher: true,
    id: uuidv7(),
    reimbursementId: SEED_UPCOMING_REIMBURSEMENT_ID,
    sortOrder: 0,
    updatedAt: now,
  });

  log("Created upcoming event reimbursement");
}

export async function ensureExportVendorPayment(userId: string): Promise<void> {
  const existingPayment = await db.query.vendorPayment.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_EXPORT_VENDOR_PAYMENT_ID),
  });
  if (existingPayment) {
    return;
  }

  const category = await db.query.expenseCategory.findFirst();
  const seededVendor = await db.query.vendor.findFirst({
    where: (table, ops) => ops.eq(table.id, SEED_VENDOR_ID),
  });
  if (!(category && seededVendor)) {
    throw new Error(
      "Vendor payment export fixture requires category and vendor"
    );
  }

  const createdAt = new Date("2026-07-01T00:00:00.000Z");
  await db.insert(vendorPayment).values({
    chargedTo: "organisation",
    costCentreId: COST_CENTRE_IDS.bangalore,
    createdAt,
    id: SEED_EXPORT_VENDOR_PAYMENT_ID,
    invoiceDate: "2026-01-20",
    invoiceNumber: "E2E-INV-2026-001",
    status: "completed",
    submittedAt: createdAt,
    title: "E2E Export Vendor Payment",
    updatedAt: createdAt,
    userId,
    vendorId: seededVendor.id,
  });

  await db.insert(vendorPaymentLineItem).values({
    amountPaise: 87500,
    categoryId: category.id,
    createdAt,
    description: "Export date filter fixture",
    id: uuidv7(),
    sortOrder: 0,
    updatedAt: createdAt,
    vendorPaymentId: SEED_EXPORT_VENDOR_PAYMENT_ID,
  });

  log("Created vendor payment export fixture");
}
