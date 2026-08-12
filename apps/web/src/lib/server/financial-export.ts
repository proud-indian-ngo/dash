import { db } from "@pi-dash/db";
import {
  advancePayment,
  advancePaymentAttachment,
  advancePaymentLineItem,
} from "@pi-dash/db/schema/advance-payment";
import { user } from "@pi-dash/db/schema/auth";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { CsvFile } from "@/lib/csv-export";
import {
  type ExportAttachmentLink,
  formatExportAttachmentLinks,
  groupExportAttachments,
} from "@/lib/export-attachments";
import type {
  FinancialExportInput,
  RequestExportStatus,
  VendorPaymentExportStatus,
} from "@/lib/financial-export-contract";

const REQUEST_CSV_HEADERS = [
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
  "Attachments",
];

const VP_CSV_HEADERS = [
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
];

const TX_CSV_HEADERS = [
  "Vendor Payment",
  "Amount",
  "Description",
  "Transaction Date",
  "Payment Method",
  "Reference",
  "Status",
  "Recorded By",
];

interface RequestExportRow {
  attachments: ExportAttachmentLink[];
  city: string;
  createdAt: string;
  createdBy: string;
  email: string;
  expenseDate: string;
  status: string;
  submittedAt: string;
  title: string;
  total: string;
  type: string;
}

interface VendorPaymentExportRow {
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

interface TransactionExportRow {
  amount: string;
  description: string;
  paymentMethod: string;
  paymentReference: string;
  recordedBy: string;
  status: string;
  transactionDate: string;
  vendorPaymentTitle: string;
}

export interface StoredExportAttachment {
  filename: null | string;
  id: string;
  objectKey: string;
  parentId: string;
  parentTitle: string;
  requestType: "advance-payments" | "reimbursements";
}

export interface FinancialExportData {
  attachments: StoredExportAttachment[];
  csvFiles: CsvFile[];
  requestCount: number;
  transactionCount: number;
  vendorPaymentCount: number;
}

type MainTable = typeof reimbursement | typeof advancePayment;
type LineItemTable =
  | typeof reimbursementLineItem
  | typeof advancePaymentLineItem;
type AttachmentTable =
  | typeof reimbursementAttachment
  | typeof advancePaymentAttachment;

interface QueryConfig {
  attachmentJoinCol: AnyPgColumn;
  attachmentKind: "advancePaymentAttachment" | "reimbursementAttachment";
  attachmentTable: AttachmentTable;
  expenseDateCol?: AnyPgColumn;
  lineItemAmountCol: AnyPgColumn;
  lineItemJoinCol: AnyPgColumn;
  lineItemTable: LineItemTable;
  mainTable: MainTable;
  requestType: StoredExportAttachment["requestType"];
  typeLabel: string;
}

interface RawResultRow {
  city: string | null;
  createdAt: Date;
  createdBy: string | null;
  email: string;
  expenseDate?: string | null;
  id: string;
  status: string;
  submittedAt: Date | null;
  title: string;
  total: string | null;
}

interface RequestQueryResult {
  attachments: StoredExportAttachment[];
  rows: RequestExportRow[];
}

async function queryRequestRows(
  config: QueryConfig,
  fyStart: number,
  statusFilter: RequestExportStatus[] | null
): Promise<RequestQueryResult> {
  const { mainTable, lineItemTable, attachmentTable, typeLabel } = config;
  const fyStartDate = new Date(fyStart, 3, 1);
  const fyEndDate = new Date(fyStart + 1, 2, 31, 23, 59, 59, 999);
  const dateRangeFilter = config.expenseDateCol
    ? and(
        gte(config.expenseDateCol, `${fyStart}-04-01`),
        lte(config.expenseDateCol, `${fyStart + 1}-03-31`)
      )
    : and(
        gte(mainTable.submittedAt, fyStartDate),
        lte(mainTable.submittedAt, fyEndDate)
      );

  const selectFields: Record<string, AnyPgColumn | ReturnType<typeof sum>> = {
    city: mainTable.city,
    createdAt: mainTable.createdAt,
    createdBy: user.name,
    email: user.email,
    id: mainTable.id,
    status: mainTable.status,
    submittedAt: mainTable.submittedAt,
    title: mainTable.title,
    total: sum(config.lineItemAmountCol),
  };
  const groupByFields: AnyPgColumn[] = [
    mainTable.id,
    mainTable.title,
    user.name,
    user.email,
    mainTable.status,
    mainTable.city,
    mainTable.submittedAt,
    mainTable.createdAt,
  ];
  if (config.expenseDateCol) {
    selectFields.expenseDate = config.expenseDateCol;
    groupByFields.push(config.expenseDateCol);
  }

  const results = (await db
    .select(selectFields)
    .from(mainTable)
    .innerJoin(user, eq(mainTable.userId, user.id))
    .leftJoin(lineItemTable, eq(config.lineItemJoinCol, mainTable.id))
    .where(
      and(
        dateRangeFilter,
        statusFilter ? inArray(mainTable.status, statusFilter) : undefined
      )
    )
    .groupBy(...groupByFields)) as unknown as RawResultRow[];

  const ids = results.map((result) => result.id);
  const rawAttachments =
    ids.length > 0
      ? await db
          .select({
            filename: attachmentTable.filename,
            id: attachmentTable.id,
            mimeType: attachmentTable.mimeType,
            objectKey: attachmentTable.objectKey,
            parentId: config.attachmentJoinCol,
            type: attachmentTable.type,
            url: attachmentTable.url,
          })
          .from(attachmentTable)
          .where(inArray(config.attachmentJoinCol, ids))
      : [];

  const attachmentsByRecord = groupExportAttachments(
    rawAttachments,
    config.attachmentKind
  );
  const titleById = new Map(results.map((result) => [result.id, result.title]));
  const attachments = rawAttachments.flatMap((attachment) =>
    attachment.type === "file" && attachment.objectKey
      ? [
          {
            filename: attachment.filename,
            id: attachment.id,
            objectKey: attachment.objectKey,
            parentId: attachment.parentId,
            parentTitle: titleById.get(attachment.parentId) ?? "untitled",
            requestType: config.requestType,
          },
        ]
      : []
  );

  return {
    attachments,
    rows: results.map((result) => ({
      attachments: attachmentsByRecord.get(result.id) ?? [],
      city: result.city ?? "",
      createdAt: result.createdAt.toISOString(),
      createdBy: result.createdBy ?? "",
      email: result.email,
      expenseDate: result.expenseDate ?? "",
      status: result.status,
      submittedAt: result.submittedAt?.toISOString() ?? "",
      title: result.title,
      total: result.total ?? "0",
      type: typeLabel,
    })),
  };
}

const reimbursementConfig: QueryConfig = {
  attachmentJoinCol: reimbursementAttachment.reimbursementId,
  attachmentKind: "reimbursementAttachment",
  attachmentTable: reimbursementAttachment,
  expenseDateCol: reimbursement.expenseDate,
  lineItemAmountCol: reimbursementLineItem.amount,
  lineItemJoinCol: reimbursementLineItem.reimbursementId,
  lineItemTable: reimbursementLineItem,
  mainTable: reimbursement,
  requestType: "reimbursements",
  typeLabel: "Reimbursement",
};

const advancePaymentConfig: QueryConfig = {
  attachmentJoinCol: advancePaymentAttachment.advancePaymentId,
  attachmentKind: "advancePaymentAttachment",
  attachmentTable: advancePaymentAttachment,
  lineItemAmountCol: advancePaymentLineItem.amount,
  lineItemJoinCol: advancePaymentLineItem.advancePaymentId,
  lineItemTable: advancePaymentLineItem,
  mainTable: advancePayment,
  requestType: "advance-payments",
  typeLabel: "Advance Payment",
};

async function queryVendorPaymentRows(
  fyStart: number,
  statusFilter: VendorPaymentExportStatus[] | null,
  includeTransactions: boolean
): Promise<{
  rows: VendorPaymentExportRow[];
  transactionRows: TransactionExportRow[];
}> {
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
    .where(
      and(
        gte(vendorPayment.invoiceDate, `${fyStart}-04-01`),
        lte(vendorPayment.invoiceDate, `${fyStart + 1}-03-31`),
        statusFilter ? inArray(vendorPayment.status, statusFilter) : undefined
      )
    )
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

  const vendorPaymentIds = results.map((result) => result.id);
  const transactionTotals =
    vendorPaymentIds.length > 0
      ? await db
          .select({
            paidAmount: sum(vendorPaymentTransaction.amount),
            vendorPaymentId: vendorPaymentTransaction.vendorPaymentId,
          })
          .from(vendorPaymentTransaction)
          .where(
            and(
              inArray(
                vendorPaymentTransaction.vendorPaymentId,
                vendorPaymentIds
              ),
              eq(vendorPaymentTransaction.status, "approved")
            )
          )
          .groupBy(vendorPaymentTransaction.vendorPaymentId)
      : [];
  const paidByVendorPaymentId = new Map(
    transactionTotals.map((total) => [
      total.vendorPaymentId,
      Number(total.paidAmount ?? 0),
    ])
  );
  const rows = results.map((result) => {
    const total = Number(result.totalAmount ?? 0);
    const paid = paidByVendorPaymentId.get(result.id) ?? 0;
    return {
      createdAt: result.createdAt.toISOString(),
      createdBy: result.createdBy ?? "",
      email: result.email,
      invoiceDate: result.invoiceDate ?? "",
      invoiceNumber: result.invoiceNumber ?? "",
      paidAmount: String(paid),
      remaining: String(Math.max(0, total - paid)),
      status: result.status,
      submittedAt: result.submittedAt?.toISOString() ?? "",
      title: result.title,
      totalAmount: String(total),
      vendorName: result.vendorName ?? "",
    };
  });

  if (!(includeTransactions && vendorPaymentIds.length > 0)) {
    return { rows, transactionRows: [] };
  }
  const transactionResults = await db
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
    .where(inArray(vendorPaymentTransaction.vendorPaymentId, vendorPaymentIds));
  const titleById = new Map(results.map((result) => [result.id, result.title]));
  return {
    rows,
    transactionRows: transactionResults.map((transaction) => ({
      amount: String(transaction.amount),
      description: transaction.description ?? "",
      paymentMethod: transaction.paymentMethod ?? "",
      paymentReference: transaction.paymentReference ?? "",
      recordedBy: transaction.recordedBy ?? "",
      status: transaction.status,
      transactionDate: transaction.transactionDate?.toISOString() ?? "",
      vendorPaymentTitle: titleById.get(transaction.vendorPaymentId) ?? "",
    })),
  };
}

const requestRowToArray = (row: RequestExportRow, origin: string): string[] => [
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
  formatExportAttachmentLinks(row.attachments, origin),
];

const vendorPaymentRowToArray = (row: VendorPaymentExportRow): string[] => [
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
];

const transactionRowToArray = (row: TransactionExportRow): string[] => [
  row.vendorPaymentTitle,
  row.amount,
  row.description,
  row.transactionDate,
  row.paymentMethod,
  row.paymentReference,
  row.status,
  row.recordedBy,
];

const buildDateSuffix = (fyStart: number, today: string): string =>
  `FY${fyStart}-${String(fyStart + 1).slice(2)}_${today}`;

function buildRequestFilename(
  input: FinancialExportInput,
  today: string
): string {
  const typeParts: string[] = [];
  if (input.requestTypes.includes("reimbursement")) {
    typeParts.push("reimbursements");
  }
  if (input.requestTypes.includes("advancePayment")) {
    typeParts.push("advance-payments");
  }
  const statusPart = input.requestStatuses
    ? [...input.requestStatuses].sort().join("-")
    : "all-statuses";
  return `${typeParts.join("_")}_${statusPart}_${buildDateSuffix(input.fyStart, today)}.csv`;
}

export async function getFinancialExportData(
  input: FinancialExportInput,
  origin: string,
  today: string
): Promise<FinancialExportData> {
  const requestStatusFilter = input.requestStatuses ?? null;
  const requestQueries: Promise<RequestQueryResult>[] = [];
  if (input.requestTypes.includes("reimbursement")) {
    requestQueries.push(
      queryRequestRows(reimbursementConfig, input.fyStart, requestStatusFilter)
    );
  }
  if (input.requestTypes.includes("advancePayment")) {
    requestQueries.push(
      queryRequestRows(advancePaymentConfig, input.fyStart, requestStatusFilter)
    );
  }

  const [requestResults, vendorPaymentResult] = await Promise.all([
    Promise.all(requestQueries),
    input.includeVendorPayments
      ? queryVendorPaymentRows(
          input.fyStart,
          input.vendorPaymentStatuses ?? null,
          input.includeTransactions
        )
      : Promise.resolve({ rows: [], transactionRows: [] }),
  ]);
  const requestRows = requestResults.flatMap((result) => result.rows);
  const attachments = requestResults.flatMap((result) => result.attachments);
  const csvFiles: CsvFile[] = [];
  if (input.requestTypes.length > 0) {
    csvFiles.push({
      filename: buildRequestFilename(input, today),
      headers: REQUEST_CSV_HEADERS,
      rows: requestRows.map((row) => requestRowToArray(row, origin)),
    });
  }
  const dateSuffix = buildDateSuffix(input.fyStart, today);
  if (input.includeVendorPayments) {
    csvFiles.push({
      filename: `vendor-payments_${dateSuffix}.csv`,
      headers: VP_CSV_HEADERS,
      rows: vendorPaymentResult.rows.map(vendorPaymentRowToArray),
    });
    if (input.includeTransactions) {
      csvFiles.push({
        filename: `vendor-payment-transactions_${dateSuffix}.csv`,
        headers: TX_CSV_HEADERS,
        rows: vendorPaymentResult.transactionRows.map(transactionRowToArray),
      });
    }
  }

  return {
    attachments,
    csvFiles,
    requestCount: requestRows.length,
    transactionCount: vendorPaymentResult.transactionRows.length,
    vendorPaymentCount: vendorPaymentResult.rows.length,
  };
}
