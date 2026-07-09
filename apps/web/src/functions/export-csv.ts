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
import { logErrorAndRethrow } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import z from "zod";
import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

const statusValues = ["pending", "approved", "rejected"] as const;
type StatusValue = (typeof statusValues)[number];
const statusEnum = z.enum(statusValues);

const exportCsvSchema = z.object({
  fyStart: z.number().int().min(2020).max(2099),
  statuses: z.array(statusEnum).optional(),
  types: z
    .array(z.enum(["reimbursement", "advancePayment"]))
    .min(1, "Select at least one type"),
});

export interface ExportAttachment {
  filename: string | null;
  id: string;
  kind: "advancePaymentAttachment" | "reimbursementAttachment";
  mimeType: string | null;
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

export function groupExportAttachments<
  T extends Omit<ExportAttachment, "kind"> & { parentId: string },
>(
  attachments: T[],
  kind: ExportAttachment["kind"]
): Map<string, ExportAttachment[]> {
  const map = new Map<string, ExportAttachment[]>();
  for (const a of attachments) {
    const list = map.get(a.parentId) ?? [];
    list.push({
      filename: a.filename,
      id: a.id,
      kind,
      mimeType: a.mimeType,
      type: a.type,
      url: a.url,
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
  attachmentKind: ExportAttachment["kind"];
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
            filename: attachmentTable.filename,
            id: attachmentTable.id,
            mimeType: attachmentTable.mimeType,
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

  return results.map((r) => ({
    attachments: attachmentsByRecord.get(r.id) ?? [],
    city: r.city ?? "",
    createdAt: r.createdAt.toISOString(),
    createdBy: r.createdBy ?? "",
    email: r.email,
    expenseDate: r.expenseDate ?? "",
    status: r.status,
    submittedAt: r.submittedAt?.toISOString() ?? "",
    title: r.title,
    total: r.total ?? "0",
    type: typeLabel,
  }));
}

const reimbursementConfig: QueryConfig = {
  attachmentJoinCol: reimbursementAttachment.reimbursementId,
  attachmentKind: "reimbursementAttachment",
  attachmentTable: reimbursementAttachment,
  hasExpenseDate: true,
  lineItemAmountCol: reimbursementLineItem.amount,
  lineItemJoinCol: reimbursementLineItem.reimbursementId,
  lineItemTable: reimbursementLineItem,
  mainTable: reimbursement,
  typeLabel: "Reimbursement",
};

const advancePaymentConfig: QueryConfig = {
  attachmentJoinCol: advancePaymentAttachment.advancePaymentId,
  attachmentKind: "advancePaymentAttachment",
  attachmentTable: advancePaymentAttachment,
  hasExpenseDate: false,
  lineItemAmountCol: advancePaymentLineItem.amount,
  lineItemJoinCol: advancePaymentLineItem.advancePaymentId,
  lineItemTable: advancePaymentLineItem,
  mainTable: advancePayment,
  typeLabel: "Advance Payment",
};

export const exportCsvData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(exportCsvSchema)
  .handler(async ({ context, data }) => {
    try {
      await assertServerPermission(context.session, "requests.export");

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
    } catch (error) {
      logErrorAndRethrow(
        { method: "POST", path: "/fn/exportCsvData" },
        {
          fyStart: data.fyStart,
          handler: "exportCsvData",
          statuses: data.statuses,
          types: data.types,
          userId: context.session?.user.id,
        },
        error
      );
    }
  });
