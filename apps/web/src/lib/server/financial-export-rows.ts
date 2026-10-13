/**
 * The CSV column contract of the financial-year export. New columns go at the
 * end of a sheet so spreadsheets and CA templates keyed by column letter keep
 * working; the Programme column was appended in October 2026.
 */
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
  city: string;
  createdAt: string;
  createdBy: string;
  email: string;
  expenseDate: string;
  programme: string;
  status: string;
  submittedAt: string;
  title: string;
  total: string;
  type: string;
}

export interface VendorPaymentExportRow {
  createdAt: string;
  createdBy: string;
  email: string;
  invoiceDate: string;
  invoiceNumber: string;
  paidAmount: string;
  programme: string;
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
