import { db } from "@pi-dash/db";
import {
  advancePayment,
  advancePaymentAttachment,
  advancePaymentLineItem,
} from "@pi-dash/db/schema/advance-payment";
import { user } from "@pi-dash/db/schema/auth";
import { programme, project } from "@pi-dash/db/schema/finance-dimensions";
import {
  reimbursement,
  reimbursementAttachment,
  reimbursementLineItem,
} from "@pi-dash/db/schema/reimbursement";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import {
  vendor,
  vendorPayment,
  vendorPaymentLineItem,
} from "@pi-dash/db/schema/vendor";
import { vendorPaymentTransaction } from "@pi-dash/db/schema/vendor-payment-transaction";
import type { ExpenseChargedTo } from "@pi-dash/shared/constants";
import {
  ADMIN_PROGRAMME_LABEL,
  EXPENSE_CHARGED_TO_LABELS,
  expenseProgrammeOf,
} from "@pi-dash/shared/expense-charge";
import { formatNoInvoice } from "@pi-dash/shared/vendor-payment";
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import type { CsvFile } from "@/lib/csv-export";
import { groupExportAttachments } from "@/lib/export-attachments";
import type {
  FinancialExportInput,
  RequestExportStatus,
  VendorPaymentExportStatus,
} from "@/lib/financial-export-contract";

import {
  REQUEST_CSV_HEADERS,
  type RequestExportRow,
  requestRowToArray,
  requestTotalCell,
  sumToPaise,
  transactionAmountCell,
  type TransactionExportRow,
  transactionRowToArray,
  TX_CSV_HEADERS,
  type VendorPaymentExportRow,
  vendorPaymentAmountCells,
  vendorPaymentRowToArray,
  VP_CSV_HEADERS,
} from "./financial-export-rows";

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

interface ChargeColumns {
  chargedProgrammeId: AnyPgColumn;
  chargedProjectId: AnyPgColumn;
  chargedTo: AnyPgColumn;
  eventId: AnyPgColumn;
}

interface QueryConfig {
  attachmentJoinCol: AnyPgColumn;
  attachmentKind: "advancePaymentAttachment" | "reimbursementAttachment";
  attachmentTable: AttachmentTable;
  /** Set when the request carries "Charged to"; legacy advances do not. */
  chargeCols?: ChargeColumns;
  expenseDateCol?: AnyPgColumn;
  lineItemAmountCol: AnyPgColumn;
  lineItemJoinCol: AnyPgColumn;
  lineItemTable: LineItemTable;
  mainTable: MainTable;
  requestType: StoredExportAttachment["requestType"];
  typeLabel: string;
}

interface RawChargeRow {
  chargedProgrammeId?: string | null;
  chargedProjectId?: string | null;
  chargedTo?: ExpenseChargedTo | null;
  eventProgrammeId?: string | null;
}

interface RawResultRow extends RawChargeRow {
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

interface DimensionNames {
  programmes: Map<string, string>;
  projects: Map<string, string>;
}

/** Programme and project names by id, for the Programme and Project columns. */
async function loadDimensionNames(): Promise<DimensionNames> {
  const [programmes, projects] = await Promise.all([
    db.select({ id: programme.id, name: programme.name }).from(programme),
    db.select({ id: project.id, name: project.name }).from(project),
  ]);
  return {
    programmes: new Map(programmes.map((row) => [row.id, row.name])),
    projects: new Map(projects.map((row) => [row.id, row.name])),
  };
}

/**
 * The Programme, Project and Charged to columns, derived by
 * `expenseProgrammeOf` like everywhere else. Legacy advances, charged to
 * nothing, leave all three empty.
 */
function chargeCells(
  row: RawChargeRow,
  names: DimensionNames
): { chargedTo: string; programme: string; project: string } {
  if (!row.chargedTo) {
    return { chargedTo: "", programme: "", project: "" };
  }
  const { isAdmin, programmeId, projectId } = expenseProgrammeOf({
    chargedProgrammeId: row.chargedProgrammeId,
    chargedProjectId: row.chargedProjectId,
    chargedTo: row.chargedTo,
    event: { programmeId: row.eventProgrammeId },
  });
  let programmeName = "";
  if (isAdmin) {
    programmeName = ADMIN_PROGRAMME_LABEL;
  } else if (programmeId) {
    programmeName = names.programmes.get(programmeId) ?? "";
  }
  return {
    chargedTo: EXPENSE_CHARGED_TO_LABELS[row.chargedTo],
    programme: programmeName,
    project: projectId ? (names.projects.get(projectId) ?? "") : "",
  };
}

interface RequestQueryResult {
  attachments: StoredExportAttachment[];
  rows: RequestExportRow[];
}

async function queryRequestRows(
  config: QueryConfig,
  fyStart: number,
  statusFilter: RequestExportStatus[] | null,
  names: DimensionNames
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
  if (config.chargeCols) {
    selectFields.chargedTo = config.chargeCols.chargedTo;
    selectFields.chargedProgrammeId = config.chargeCols.chargedProgrammeId;
    selectFields.chargedProjectId = config.chargeCols.chargedProjectId;
    selectFields.eventProgrammeId = teamEvent.programmeId;
    groupByFields.push(
      config.chargeCols.chargedTo,
      config.chargeCols.chargedProgrammeId,
      config.chargeCols.chargedProjectId,
      teamEvent.programmeId
    );
  }

  let query = db
    .select(selectFields)
    .from(mainTable)
    .innerJoin(user, eq(mainTable.userId, user.id))
    .leftJoin(lineItemTable, eq(config.lineItemJoinCol, mainTable.id))
    .$dynamic();
  if (config.chargeCols) {
    query = query.leftJoin(
      teamEvent,
      eq(config.chargeCols.eventId, teamEvent.id)
    );
  }
  const results = (await query
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
      ...chargeCells(result, names),
      status: result.status,
      submittedAt: result.submittedAt?.toISOString() ?? "",
      title: result.title,
      total: requestTotalCell(result.total),
      type: typeLabel,
    })),
  };
}

const reimbursementConfig: QueryConfig = {
  attachmentJoinCol: reimbursementAttachment.reimbursementId,
  attachmentKind: "reimbursementAttachment",
  attachmentTable: reimbursementAttachment,
  chargeCols: {
    chargedProgrammeId: reimbursement.chargedProgrammeId,
    chargedProjectId: reimbursement.chargedProjectId,
    chargedTo: reimbursement.chargedTo,
    eventId: reimbursement.eventId,
  },
  expenseDateCol: reimbursement.expenseDate,
  lineItemAmountCol: reimbursementLineItem.amountPaise,
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
  lineItemAmountCol: advancePaymentLineItem.amountPaise,
  lineItemJoinCol: advancePaymentLineItem.advancePaymentId,
  lineItemTable: advancePaymentLineItem,
  mainTable: advancePayment,
  requestType: "advance-payments",
  typeLabel: "Advance Payment",
};

async function queryVendorPaymentRows(
  names: DimensionNames,
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
      chargedProgrammeId: vendorPayment.chargedProgrammeId,
      chargedProjectId: vendorPayment.chargedProjectId,
      chargedTo: vendorPayment.chargedTo,
      eventProgrammeId: teamEvent.programmeId,
      noInvoiceReason: vendorPayment.noInvoiceReason,
      status: vendorPayment.status,
      submittedAt: vendorPayment.submittedAt,
      title: vendorPayment.title,
      totalAmount: sum(vendorPaymentLineItem.amountPaise),
      vendorName: vendor.name,
    })
    .from(vendorPayment)
    .innerJoin(user, eq(vendorPayment.userId, user.id))
    .innerJoin(vendor, eq(vendorPayment.vendorId, vendor.id))
    .leftJoin(teamEvent, eq(vendorPayment.eventId, teamEvent.id))
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
      vendorPayment.noInvoiceReason,
      vendorPayment.status,
      vendorPayment.submittedAt,
      vendorPayment.createdAt,
      user.name,
      user.email,
      vendor.name,
      vendorPayment.chargedTo,
      vendorPayment.chargedProgrammeId,
      vendorPayment.chargedProjectId,
      teamEvent.programmeId
    );

  const vendorPaymentIds = results.map((result) => result.id);
  const transactionTotals =
    vendorPaymentIds.length > 0
      ? await db
          .select({
            paidAmount: sum(vendorPaymentTransaction.amountPaise),
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
      sumToPaise(total.paidAmount),
    ])
  );
  const rows = results.map((result) => {
    const paid = paidByVendorPaymentId.get(result.id) ?? 0;
    return {
      ...vendorPaymentAmountCells(sumToPaise(result.totalAmount), paid),
      createdAt: result.createdAt.toISOString(),
      createdBy: result.createdBy ?? "",
      email: result.email,
      invoiceDate: result.invoiceDate ?? "",
      // A payment without an invoice shows its reason in the number column.
      invoiceNumber:
        result.invoiceNumber ??
        (result.noInvoiceReason ? formatNoInvoice(result.noInvoiceReason) : ""),
      ...chargeCells(result, names),
      status: result.status,
      submittedAt: result.submittedAt?.toISOString() ?? "",
      title: result.title,
      vendorName: result.vendorName ?? "",
    };
  });

  if (!(includeTransactions && vendorPaymentIds.length > 0)) {
    return { rows, transactionRows: [] };
  }
  const transactionResults = await db
    .select({
      amountPaise: vendorPaymentTransaction.amountPaise,
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
      amount: transactionAmountCell(transaction.amountPaise),
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
  const names = await loadDimensionNames();
  const requestQueries: Promise<RequestQueryResult>[] = [];
  if (input.requestTypes.includes("reimbursement")) {
    requestQueries.push(
      queryRequestRows(
        reimbursementConfig,
        input.fyStart,
        requestStatusFilter,
        names
      )
    );
  }
  if (input.requestTypes.includes("advancePayment")) {
    requestQueries.push(
      queryRequestRows(
        advancePaymentConfig,
        input.fyStart,
        requestStatusFilter,
        names
      )
    );
  }

  const [requestResults, vendorPaymentResult] = await Promise.all([
    Promise.all(requestQueries),
    input.includeVendorPayments
      ? queryVendorPaymentRows(
          names,
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
