import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import z from "zod";
import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export const vendorPaymentStatusValues = [
  "pending",
  "approved",
  "rejected",
  "partially_paid",
  "paid",
  "invoice_pending",
  "completed",
] as const;
const statusEnum = z.enum(vendorPaymentStatusValues);

const exportSchema = z.object({
  fyStart: z.number().int().min(2020).max(2099),
  statuses: z.array(statusEnum).optional(),
  includeTransactions: z.boolean().optional(),
});

export interface VendorPaymentExportRow {
  createdAt: string;
  createdBy: string;
  email: string;
  invoiceDate: string;
  invoiceNumber: string;
  paidAmount: string;
  remaining: string;
  status: string;
  submittedAt: string;
  title: string;
  totalAmount: string;
  vendorName: string;
}

export interface TransactionExportRow {
  amount: string;
  description: string;
  paymentMethod: string;
  paymentReference: string;
  recordedBy: string;
  status: string;
  transactionDate: string;
  vendorPaymentTitle: string;
}

export const exportVendorPaymentsCsv = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(exportSchema)
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "requests.export");

    const fyStartDate = new Date(Date.UTC(data.fyStart, 3, 1));
    const fyEndDate = new Date(
      Date.UTC(data.fyStart + 1, 2, 31, 23, 59, 59, 999)
    );
    const statusFilter =
      data.statuses && data.statuses.length > 0 ? data.statuses : null;

    const whereClause = and(
      gte(vendorPayment.submittedAt, fyStartDate),
      lte(vendorPayment.submittedAt, fyEndDate),
      statusFilter ? inArray(vendorPayment.status, statusFilter) : undefined
    );

    // Query vendor payments with totals
    const results = await db
      .select({
        id: vendorPayment.id,
        title: vendorPayment.title,
        invoiceNumber: vendorPayment.invoiceNumber,
        invoiceDate: vendorPayment.invoiceDate,
        status: vendorPayment.status,
        submittedAt: vendorPayment.submittedAt,
        createdAt: vendorPayment.createdAt,
        createdBy: user.name,
        email: user.email,
        vendorName: vendor.name,
        totalAmount: sum(vendorPaymentLineItem.amount),
      })
      .from(vendorPayment)
      .innerJoin(user, eq(vendorPayment.userId, user.id))
      .innerJoin(vendor, eq(vendorPayment.vendorId, vendor.id))
      .leftJoin(
        vendorPaymentLineItem,
        eq(vendorPaymentLineItem.vendorPaymentId, vendorPayment.id)
      )
      .where(whereClause)
      .groupBy(
        vendorPayment.id,
        vendorPayment.title,
        vendorPayment.invoiceNumber,
        vendorPayment.invoiceDate,
        vendorPayment.status,
        vendorPayment.submittedAt,
        vendorPayment.createdAt,
        user.name,
        user.email,
        vendor.name
      );

    // Get approved transaction totals per VP
    const vpIds = results.map((r) => r.id);
    const txTotals =
      vpIds.length > 0
        ? await db
            .select({
              vendorPaymentId: vendorPaymentTransaction.vendorPaymentId,
              paidAmount: sum(vendorPaymentTransaction.amount),
            })
            .from(vendorPaymentTransaction)
            .where(
              and(
                inArray(vendorPaymentTransaction.vendorPaymentId, vpIds),
                eq(vendorPaymentTransaction.status, "approved")
              )
            )
            .groupBy(vendorPaymentTransaction.vendorPaymentId)
        : [];

    const paidMap = new Map(
      txTotals.map((t) => [t.vendorPaymentId, Number(t.paidAmount ?? 0)])
    );

    const rows: VendorPaymentExportRow[] = results.map((r) => {
      const total = Number(r.totalAmount ?? 0);
      const paid = paidMap.get(r.id) ?? 0;
      return {
        title: r.title,
        vendorName: r.vendorName ?? "",
        invoiceNumber: r.invoiceNumber ?? "",
        invoiceDate: r.invoiceDate ?? "",
        createdBy: r.createdBy ?? "",
        email: r.email,
        status: r.status,
        totalAmount: String(total),
        paidAmount: String(paid),
        remaining: String(Math.max(0, total - paid)),
        submittedAt: r.submittedAt?.toISOString() ?? "",
        createdAt: r.createdAt.toISOString(),
      };
    });

    // Optional: include transaction details
    let transactionRows: TransactionExportRow[] = [];
    if (data.includeTransactions && vpIds.length > 0) {
      const txResults = await db
        .select({
          vendorPaymentId: vendorPaymentTransaction.vendorPaymentId,
          amount: vendorPaymentTransaction.amount,
          description: vendorPaymentTransaction.description,
          transactionDate: vendorPaymentTransaction.transactionDate,
          paymentMethod: vendorPaymentTransaction.paymentMethod,
          paymentReference: vendorPaymentTransaction.paymentReference,
          status: vendorPaymentTransaction.status,
          recordedBy: user.name,
        })
        .from(vendorPaymentTransaction)
        .innerJoin(user, eq(vendorPaymentTransaction.userId, user.id))
        .where(inArray(vendorPaymentTransaction.vendorPaymentId, vpIds));

      const titleMap = new Map(results.map((r) => [r.id, r.title]));

      transactionRows = txResults.map((t) => ({
        vendorPaymentTitle: titleMap.get(t.vendorPaymentId) ?? "",
        amount: String(t.amount),
        description: t.description ?? "",
        transactionDate: t.transactionDate?.toISOString() ?? "",
        paymentMethod: t.paymentMethod ?? "",
        paymentReference: t.paymentReference ?? "",
        status: t.status,
        recordedBy: t.recordedBy ?? "",
      }));
    }

    return { rows, transactionRows };
  });
