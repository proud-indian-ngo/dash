import { db } from "@pi-dash/db";

export function formatEventDate(startTime: number): string {
  return new Date(startTime).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    weekday: "short",
  });
}

import { advancePaymentLineItem } from "@pi-dash/db/schema/advance-payment";
import { user } from "@pi-dash/db/schema/auth";
import { expenseCategory } from "@pi-dash/db/schema/expense-category";
import { rolePermission } from "@pi-dash/db/schema/permission";
import { reimbursementLineItem } from "@pi-dash/db/schema/reimbursement";
import { vendorPaymentLineItem } from "@pi-dash/db/schema/vendor";
import { and, asc, eq, isNull, or } from "drizzle-orm";
export interface LineItemDetail {
  amount: string;
  categoryName: string;
  description: string | null;
}

export async function getUserIdsWithPermission(
  permissionId: string
): Promise<string[]> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .innerJoin(rolePermission, eq(user.role, rolePermission.roleId))
    .where(
      and(
        eq(rolePermission.permissionId, permissionId),
        or(eq(user.banned, false), isNull(user.banned))
      )
    );
  return rows.map((r) => r.id);
}

export async function getUserName(userId: string): Promise<string | null> {
  const rows = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return rows[0]?.name ?? null;
}

export async function getReimbursementLineItems(
  reimbursementId: string
): Promise<LineItemDetail[]> {
  return await db
    .select({
      amount: reimbursementLineItem.amount,
      categoryName: expenseCategory.name,
      description: reimbursementLineItem.description,
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
      amount: advancePaymentLineItem.amount,
      categoryName: expenseCategory.name,
      description: advancePaymentLineItem.description,
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
      amount: vendorPaymentLineItem.amount,
      categoryName: expenseCategory.name,
      description: vendorPaymentLineItem.description,
    })
    .from(vendorPaymentLineItem)
    .innerJoin(
      expenseCategory,
      eq(vendorPaymentLineItem.categoryId, expenseCategory.id)
    )
    .where(eq(vendorPaymentLineItem.vendorPaymentId, vendorPaymentId))
    .orderBy(asc(vendorPaymentLineItem.sortOrder));
}
