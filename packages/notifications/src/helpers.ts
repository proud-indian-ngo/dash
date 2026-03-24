import { db } from "@pi-dash/db";
import { advancePaymentLineItem } from "@pi-dash/db/schema/advance-payment";
import { user } from "@pi-dash/db/schema/auth";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { reimbursementLineItem } from "@pi-dash/db/schema/reimbursement";
import { vendorPaymentLineItem } from "@pi-dash/db/schema/vendor";
import { asc, eq } from "drizzle-orm";
import { courier } from "./client";

export interface LineItemDetail {
  amount: string;
  categoryName: string;
  description: string | null;
}

export async function getAdminUserIds(): Promise<string[]> {
  const admins = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"));
  return admins.map((a) => a.id);
}

export async function getUserName(userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.name ?? null;
}

export async function syncCourierUser({
  userId,
  email,
  name,
}: {
  userId: string;
  email: string;
  name: string;
}): Promise<void> {
  if (!courier) {
    return;
  }
  await courier.profiles.replace(userId, {
    profile: { email, name },
  });
}

export async function getReimbursementLineItems(
  reimbursementId: string
): Promise<LineItemDetail[]> {
  return await db
    .select({
      description: reimbursementLineItem.description,
      categoryName: expenseCategory.name,
      amount: reimbursementLineItem.amount,
    })
    .from(reimbursementLineItem)
    .innerJoin(
      expenseCategory,
      eq(reimbursementLineItem.categoryId, expenseCategory.id)
    )
    .where(eq(reimbursementLineItem.reimbursementId, reimbursementId))
    .orderBy(asc(reimbursementLineItem.sortOrder));
}

export async function getAdvancePaymentLineItems(
  advancePaymentId: string
): Promise<LineItemDetail[]> {
  return await db
    .select({
      description: advancePaymentLineItem.description,
      categoryName: expenseCategory.name,
      amount: advancePaymentLineItem.amount,
    })
    .from(advancePaymentLineItem)
    .innerJoin(
      expenseCategory,
      eq(advancePaymentLineItem.categoryId, expenseCategory.id)
    )
    .where(eq(advancePaymentLineItem.advancePaymentId, advancePaymentId))
    .orderBy(asc(advancePaymentLineItem.sortOrder));
}

export async function getVendorPaymentLineItems(
  vendorPaymentId: string
): Promise<LineItemDetail[]> {
  return await db
    .select({
      description: vendorPaymentLineItem.description,
      categoryName: expenseCategory.name,
      amount: vendorPaymentLineItem.amount,
    })
    .from(vendorPaymentLineItem)
    .innerJoin(
      expenseCategory,
      eq(vendorPaymentLineItem.categoryId, expenseCategory.id)
    )
    .where(eq(vendorPaymentLineItem.vendorPaymentId, vendorPaymentId))
    .orderBy(asc(vendorPaymentLineItem.sortOrder));
}
