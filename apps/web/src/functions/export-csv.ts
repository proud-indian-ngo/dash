import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
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
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import z from "zod";
import { authMiddleware } from "@/middleware/auth";

const statusValues = ["pending", "approved", "rejected"] as const;
type StatusValue = (typeof statusValues)[number];
const statusEnum = z.enum(statusValues);

const exportCsvSchema = z.object({
  types: z
    .array(z.enum(["reimbursement", "advancePayment"]))
    .min(1, "Select at least one type"),
  fyStart: z.number().int().min(2020).max(2099),
  statuses: z.array(statusEnum).optional(),
});

export interface ExportAttachment {
  filename: string | null;
  mimeType: string | null;
  objectKey: string | null;
  type: "file" | "url";
  url: string | null;
}

export interface ExportRow {
  attachments: ExportAttachment[];
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

function groupAttachments<T extends ExportAttachment & { parentId: string }>(
  attachments: T[]
): Map<string, ExportAttachment[]> {
  const map = new Map<string, ExportAttachment[]>();
  for (const a of attachments) {
    const list = map.get(a.parentId) ?? [];
    list.push({
      type: a.type,
      filename: a.filename,
      objectKey: a.objectKey,
      url: a.url,
      mimeType: a.mimeType,
    });
    map.set(a.parentId, list);
  }
  return map;
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
  attachmentTable: AttachmentTable;
  hasExpenseDate: boolean;
  lineItemAmountCol: AnyPgColumn;
  lineItemJoinCol: AnyPgColumn;
  lineItemTable: LineItemTable;
  mainTable: MainTable;
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

async function queryExportRows(
  config: QueryConfig,
  fyStartDate: Date,
  fyEndDate: Date,
  statusFilter: StatusValue[] | null
): Promise<ExportRow[]> {
  const { mainTable, lineItemTable, attachmentTable, typeLabel } = config;

  const whereClause = and(
    gte(mainTable.submittedAt, fyStartDate),
    lte(mainTable.submittedAt, fyEndDate),
    statusFilter ? inArray(mainTable.status, statusFilter) : undefined
  );

  const selectFields: Record<string, AnyPgColumn | ReturnType<typeof sum>> = {
    id: mainTable.id,
    title: mainTable.title,
    createdBy: user.name,
    email: user.email,
    status: mainTable.status,
    total: sum(config.lineItemAmountCol),
    city: mainTable.city,
    submittedAt: mainTable.submittedAt,
    createdAt: mainTable.createdAt,
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

  if (config.hasExpenseDate) {
    const expenseDateCol = (mainTable as typeof reimbursement).expenseDate;
    selectFields.expenseDate = expenseDateCol;
    groupByFields.push(expenseDateCol);
  }

  const results = (await db
    .select(selectFields)
    .from(mainTable)
    .innerJoin(user, eq(mainTable.userId, user.id))
    .leftJoin(lineItemTable, eq(config.lineItemJoinCol, mainTable.id))
    .where(whereClause)
    .groupBy(...groupByFields)) as unknown as RawResultRow[];

  const ids: string[] = results.map((r) => r.id);
  const rawAttachments =
    ids.length > 0
      ? await db
          .select({
            parentId: config.attachmentJoinCol,
            type: attachmentTable.type,
            filename: attachmentTable.filename,
            objectKey: attachmentTable.objectKey,
            url: attachmentTable.url,
            mimeType: attachmentTable.mimeType,
          })
          .from(attachmentTable)
          .where(inArray(config.attachmentJoinCol, ids))
      : [];

  const attachmentsByRecord = groupAttachments(rawAttachments);

  return results.map((r) => ({
    type: typeLabel,
    title: r.title,
    createdBy: r.createdBy ?? "",
    email: r.email,
    status: r.status,
    total: r.total ?? "0",
    city: r.city ?? "",
    expenseDate: r.expenseDate ?? "",
    submittedAt: r.submittedAt?.toISOString() ?? "",
    createdAt: r.createdAt.toISOString(),
    attachments: attachmentsByRecord.get(r.id) ?? [],
  }));
}

const reimbursementConfig: QueryConfig = {
  typeLabel: "Reimbursement",
  mainTable: reimbursement,
  lineItemTable: reimbursementLineItem,
  lineItemJoinCol: reimbursementLineItem.reimbursementId,
  lineItemAmountCol: reimbursementLineItem.amount,
  attachmentTable: reimbursementAttachment,
  attachmentJoinCol: reimbursementAttachment.reimbursementId,
  hasExpenseDate: true,
};

const advancePaymentConfig: QueryConfig = {
  typeLabel: "Advance Payment",
  mainTable: advancePayment,
  lineItemTable: advancePaymentLineItem,
  lineItemJoinCol: advancePaymentLineItem.advancePaymentId,
  lineItemAmountCol: advancePaymentLineItem.amount,
  attachmentTable: advancePaymentAttachment,
  attachmentJoinCol: advancePaymentAttachment.advancePaymentId,
  hasExpenseDate: false,
};

export const exportCsvData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(exportCsvSchema)
  .handler(async ({ context, data }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const role = context.session.user.role ?? "volunteer";
    const permissions = await resolvePermissions(role);
    if (!permissions.includes("requests.export")) {
      throw new Error("Forbidden");
    }

    const fyStartDate = new Date(data.fyStart, 3, 1); // April 1
    const fyEndDate = new Date(data.fyStart + 1, 2, 31, 23, 59, 59, 999); // March 31
    const statusFilter =
      data.statuses && data.statuses.length > 0 ? data.statuses : null;

    const promises: Promise<ExportRow[]>[] = [];

    if (data.types.includes("reimbursement")) {
      promises.push(
        queryExportRows(
          reimbursementConfig,
          fyStartDate,
          fyEndDate,
          statusFilter
        )
      );
    }

    if (data.types.includes("advancePayment")) {
      promises.push(
        queryExportRows(
          advancePaymentConfig,
          fyStartDate,
          fyEndDate,
          statusFilter
        )
      );
    }

    const results = await Promise.all(promises);
    return { rows: results.flat() };
  });
