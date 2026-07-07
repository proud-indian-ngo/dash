import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import { logErrorAndRethrow } from "@pi-dash/observability";
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
  includeTransactions: z.boolean().optional(),
  statuses: z.array(statusEnum).optional(),
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
  .validator(exportSchema)
  .handler(async ({ context, data }) => {
    try {
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
          createdAt: vendorPayment.createdAt,
          createdBy: user.name,
          email: user.email,
          id: vendorPayment.id,
          invoiceDate: vendorPayment.invoiceDate,
          invoiceNumber: vendorPayment.invoiceNumber,
          status: vendorPayment.status,
          submittedAt: vendorPayment.submittedAt,
          title: vendorPayment.title,
          totalAmount: sum(vendorPaymentLineItem.amount),
          vendorName: vendor.name,
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
      const vpIds = results.map((r: any) => r.id);
      const txTotals =
        vpIds.length > 0
          ? await db
              .select({
                paidAmount: sum(vendorPaymentTransaction.amount),
                vendorPaymentId: vendorPaymentTransaction.vendorPaymentId,
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
        txTotals.map((t: any) => [t.vendorPaymentId, Number(t.paidAmount ?? 0)])
      );

      const rows: VendorPaymentExportRow[] = results.map((r: any) => {
        const total = Number(r.totalAmount ?? 0);
        const paid = paidMap.get(r.id) ?? 0;
        return {
          createdAt: r.createdAt.toISOString(),
          createdBy: r.createdBy ?? "",
          email: r.email,
          invoiceDate: r.invoiceDate ?? "",
          invoiceNumber: r.invoiceNumber ?? "",
          paidAmount: String(paid),
          remaining: String(Math.max(0, total - paid)),
          status: r.status,
          submittedAt: r.submittedAt?.toISOString() ?? "",
          title: r.title,
          totalAmount: String(total),
          vendorName: r.vendorName ?? "",
        };
      });

      // Optional: include transaction details
      let transactionRows: TransactionExportRow[] = [];
      if (data.includeTransactions && vpIds.length > 0) {
        const txResults = await db
          .select({
            amount: vendorPaymentTransaction.amount,
            description: vendorPaymentTransaction.description,
            paymentMethod: vendorPaymentTransaction.paymentMethod,
            paymentReference: vendorPaymentTransaction.paymentReference,
            recordedBy: user.name,
            status: vendorPaymentTransaction.status,
            transactionDate: vendorPaymentTransaction.transactionDate,
            vendorPaymentId: vendorPaymentTransaction.vendorPaymentId,
          })
          .from(vendorPaymentTransaction)
          .innerJoin(user, eq(vendorPaymentTransaction.userId, user.id))
          .where(inArray(vendorPaymentTransaction.vendorPaymentId, vpIds));

        const titleMap = new Map(results.map((r: any) => [r.id, r.title]));

        transactionRows = txResults.map((t: any) => ({
          amount: String(t.amount),
          description: t.description ?? "",
          paymentMethod: t.paymentMethod ?? "",
          paymentReference: t.paymentReference ?? "",
          recordedBy: t.recordedBy ?? "",
          status: t.status,
          transactionDate: t.transactionDate?.toISOString() ?? "",
          vendorPaymentTitle: titleMap.get(t.vendorPaymentId) ?? "",
        }));
      }

      return { rows, transactionRows };
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/exportVendorPaymentsCsv" },
        {
          fyStart: data.fyStart,
          handler: "exportVendorPaymentsCsv",
          includeTransactions: data.includeTransactions,
          statuses: data.statuses,
          userId: context.session?.user.id,
        },
        error
      );
    }
  });
