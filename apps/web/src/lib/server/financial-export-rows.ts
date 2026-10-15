/**
 * The CSV column contract of the financial-year export. New columns go at the
 * end of a sheet so spreadsheets and CA templates keyed by column letter keep
 * working; the Programme column was appended in October 2026, then Project
 * and Charged to after it.
 */
import { assertSafePaise, paiseToRupees } from "@pi-dash/shared/money";

import {
  type ExportAttachmentLink,
  formatExportAttachmentLinks,
} from "@/lib/export-attachments";

export const REQUEST_CSV_HEADERS = [
  "Type",
  "Title",
  "Created By",
  "Email",
  "Status",
  "Total",
  "City",
  "Expense Date",
  "Submitted At",
  "Created At",
  "Programme",
  "Attachments",
  "Project",
  "Charged to",
];

export const VP_CSV_HEADERS = [
  "Title",
  "Vendor",
  "Invoice Number",
  "Invoice Date",
  "Created By",
  "Email",
  "Status",
  "Total Amount",
  "Paid Amount",
  "Remaining",
  "Submitted At",
  "Created At",
  "Programme",
  "Project",
  "Charged to",
];

export const TX_CSV_HEADERS = [
  "Vendor Payment",
  "Amount",
  "Description",
  "Transaction Date",
  "Payment Method",
  "Reference",
  "Status",
  "Recorded By",
];

export interface RequestExportRow {
  attachments: ExportAttachmentLink[];
  chargedTo: string;
  city: string;
  createdAt: string;
  createdBy: string;
  email: string;
  expenseDate: string;
  programme: string;
  project: string;
  status: string;
  submittedAt: string;
  title: string;
  total: string;
  type: string;
}

export interface VendorPaymentExportRow {
  chargedTo: string;
  createdAt: string;
  createdBy: string;
  email: string;
  invoiceDate: string;
  invoiceNumber: string;
  paidAmount: string;
  programme: string;
  project: string;
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

export const requestRowToArray = (
  row: RequestExportRow,
  origin: string
): string[] => [
  row.type,
  row.title,
  row.createdBy,
  row.email,
  row.status,
  row.total,
  row.city,
  row.expenseDate,
  row.submittedAt,
  row.createdAt,
  row.programme,
  formatExportAttachmentLinks(row.attachments, origin),
  row.project,
  row.chargedTo,
];

export const vendorPaymentRowToArray = (
  row: VendorPaymentExportRow
): string[] => [
  row.title,
  row.vendorName,
  row.invoiceNumber,
  row.invoiceDate,
  row.createdBy,
  row.email,
  row.status,
  row.totalAmount,
  row.paidAmount,
  row.remaining,
  row.submittedAt,
  row.createdAt,
  row.programme,
  row.project,
  row.chargedTo,
];

export const transactionRowToArray = (row: TransactionExportRow): string[] => [
  row.vendorPaymentTitle,
  row.amount,
  row.description,
  row.transactionDate,
  row.paymentMethod,
  row.paymentReference,
  row.status,
  row.recordedBy,
];

/**
 * Amounts are stored in paise but the sheets keep the rupee text they had
 * when the columns were numeric(12,2): request totals and transaction amounts
 * as two-decimal strings ("1500.00"), vendor payment totals as plain numbers
 * ("1500", "19.9").
 */

/** PostgreSQL returns sum(bigint) as a numeric string; null when no rows. */
export function sumToPaise(value: string | number | null): number {
  return value === null ? 0 : assertSafePaise(Number(value));
}

/** Request "Total": "0" when the request has no line items, else "1500.00". */
export const requestTotalCell = (sum: string | number | null): string =>
  sum === null ? "0" : paiseToRupees(sumToPaise(sum));

/** Transaction "Amount": "1500.00". */
export const transactionAmountCell = (amountPaise: number): string =>
  paiseToRupees(amountPaise);

const shortRupees = (paise: number): string =>
  String(Number(paiseToRupees(paise)));

/** Vendor payment "Total Amount", "Paid Amount" and "Remaining". */
export function vendorPaymentAmountCells(
  totalPaise: number,
  paidPaise: number
): Pick<VendorPaymentExportRow, "paidAmount" | "remaining" | "totalAmount"> {
  return {
    paidAmount: shortRupees(paidPaise),
    remaining: shortRupees(Math.max(0, totalPaise - paidPaise)),
    totalAmount: shortRupees(totalPaise),
  };
}
