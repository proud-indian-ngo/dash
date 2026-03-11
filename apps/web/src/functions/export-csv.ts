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
import { createServerFn } from "@tanstack/react-start";
import { and, eq, gte, inArray, lte, sum } from "drizzle-orm";
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

function ensureAdmin(context: {
  session: { user: { role?: string | null } } | null;
}) {
  if (!context.session) {
    throw new Error("Unauthorized");
  }
  if (context.session.user.role !== "admin") {
    throw new Error("Forbidden");
  }
}

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

interface QueryConfig {
  attachmentJoinColumn: string;
  // biome-ignore lint: Drizzle table generics are impractical to spell out
  attachmentTable: any;
  hasExpenseDate: boolean;
  lineItemJoinColumn: string;
  // biome-ignore lint: Drizzle table generics are impractical to spell out
  lineItemTable: any;
  // biome-ignore lint: Drizzle table generics are impractical to spell out
  mainTable: any;
  typeLabel: string;
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

  // biome-ignore lint: dynamic field construction requires any cast for Drizzle
  const selectFields: any = {
    id: mainTable.id,
    title: mainTable.title,
    createdBy: user.name,
    email: user.email,
    status: mainTable.status,
    total: sum(lineItemTable.amount),
    city: mainTable.city,
    submittedAt: mainTable.submittedAt,
    createdAt: mainTable.createdAt,
  };
  const groupByFields = [
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
    selectFields.expenseDate = mainTable.expenseDate;
    groupByFields.push(mainTable.expenseDate);
  }

  const results = await db
    .select(selectFields)
    .from(mainTable)
    .innerJoin(user, eq(mainTable.userId, user.id))
    .leftJoin(
      lineItemTable,
      eq(lineItemTable[config.lineItemJoinColumn], mainTable.id)
    )
    .where(whereClause)
    .groupBy(...groupByFields);

  const ids: string[] = results.map((r) => r.id);
  const rawAttachments =
    ids.length > 0
      ? await db
          .select({
            parentId: attachmentTable[config.attachmentJoinColumn],
            type: attachmentTable.type,
            filename: attachmentTable.filename,
            objectKey: attachmentTable.objectKey,
            url: attachmentTable.url,
            mimeType: attachmentTable.mimeType,
          })
          .from(attachmentTable)
          .where(inArray(attachmentTable[config.attachmentJoinColumn], ids))
      : [];

  const attachmentsByRecord = groupAttachments(rawAttachments);

  return results.map(
    // biome-ignore lint: result shape is dynamic due to optional expenseDate
    (r: any) => ({
      type: typeLabel,
      title: r.title,
      createdBy: r.createdBy,
      email: r.email,
      status: r.status,
      total: r.total ?? "0",
      city: r.city ?? "",
      expenseDate: r.expenseDate ?? "",
      submittedAt: r.submittedAt?.toISOString() ?? "",
      createdAt: r.createdAt.toISOString(),
      attachments: attachmentsByRecord.get(r.id) ?? [],
    })
  );
}

const reimbursementConfig: QueryConfig = {
  typeLabel: "Reimbursement",
  mainTable: reimbursement,
  lineItemTable: reimbursementLineItem,
  lineItemJoinColumn: "reimbursementId",
  attachmentTable: reimbursementAttachment,
  attachmentJoinColumn: "reimbursementId",
  hasExpenseDate: true,
};

const advancePaymentConfig: QueryConfig = {
  typeLabel: "Advance Payment",
  mainTable: advancePayment,
  lineItemTable: advancePaymentLineItem,
  lineItemJoinColumn: "advancePaymentId",
  attachmentTable: advancePaymentAttachment,
  attachmentJoinColumn: "advancePaymentId",
  hasExpenseDate: false,
};

export const exportCsvData = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(exportCsvSchema)
  .handler(async ({ context, data }) => {
    ensureAdmin(context);

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
