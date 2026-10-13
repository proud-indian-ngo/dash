import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import {
  assertServerAnyPermission,
  assertServerPermission,
  buildSessionContext,
} from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  AVAILABLE_IMPORT_SOURCES,
  DATE_FORMAT_VALUES,
  IGNORE_FIELD,
  IMPORT_CHANNEL_VALUES,
  IMPORT_FIELD_KEYS,
  MAX_IMPORT_FILE_BYTES,
} from "@/lib/income-import/fields";
import { parseCsv } from "@/lib/income-import/parse-csv";
import type {
  BatchDetailResponse,
  CreateBatchResponse,
  ReviewResponse,
  RunResponse,
} from "@/lib/income-import/review-types";
import {
  createImportBatch,
  getImportBatchDetail,
  reviewImportBatch,
  runImportBatch,
} from "@/lib/income-import/server";
import { authMiddleware } from "@/middleware/auth";

/**
 * CSV import of contributions. Raw rows are server-only, so the importer
 * talks to these functions rather than Zero; the batch row itself syncs for
 * the Imports tab. Writes need donors.manage and are audited with counts
 * only: never file names, cell values or row content.
 */

const importChannel = z.enum(IMPORT_CHANNEL_VALUES);

const mappingSchema = z.record(
  z.string().max(200),
  z.enum([...IMPORT_FIELD_KEYS, IGNORE_FIELD])
);

const createSchema = z.object({
  // A string's length counts UTF-16 units, so this is a ceiling, not the exact byte limit.
  csv: z.string().min(1).max(MAX_IMPORT_FILE_BYTES),
  defaultChannel: importChannel,
  fileName: z.string().trim().min(1).max(200),
  fundId: z.uuid(),
  orgAccountId: z.uuid(),
  programmeId: z.uuid().nullable(),
  projectId: z.uuid().nullable(),
  source: z.enum(AVAILABLE_IMPORT_SOURCES),
});

export const createContributionImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(createSchema)
  .handler(async ({ context, data }): Promise<CreateBatchResponse> => {
    await assertServerPermission(context.session, "donors.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const parsed = parseCsv(data.csv);
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "import_batch.create",
        metadata: { rowCount: parsed.rows.length },
        target: { type: "import_batch" },
      },
      async () => await createImportBatch(data, parsed, session.user.id),
      undefined,
      (result) => ({ id: result.batchId, type: "import_batch" })
    );
  });

export const reviewContributionImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      batchId: z.uuid(),
      dateFormat: z.enum(DATE_FORMAT_VALUES),
      defaultChannel: importChannel,
      mapping: mappingSchema,
    })
  )
  .handler(async ({ context, data }): Promise<ReviewResponse> => {
    await assertServerPermission(context.session, "donors.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "import_batch.review",
        metadata: { mappedColumnCount: Object.keys(data.mapping).length },
        target: { id: data.batchId, type: "import_batch" },
      },
      async () => await reviewImportBatch(data)
    );
  });

/**
 * The batch page's rows. Rows carry donor names and contact details from the
 * file, so they need donors.view or donors.manage; finance-only roles see the
 * synced counts instead. Identifiers are always masked; the column samples
 * used to continue an import go to donors.manage only. A read, so it is not
 * audited.
 */
export const getContributionImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ batchId: z.uuid() }))
  .handler(async ({ context, data }): Promise<BatchDetailResponse> => {
    await assertServerAnyPermission(context.session, [
      "donors.view",
      "donors.manage",
    ]);
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { permissions } = await buildSessionContext(context.session);
    return await getImportBatchDetail(data.batchId, {
      canManage: permissions.includes("donors.manage"),
    });
  });

const decisionSchema = z.object({
  contribution: z.enum(["import", "skip"]).optional(),
  donor: z.string().max(80).optional(),
  fillMissing: z.boolean().optional(),
});

export const runContributionImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      batchId: z.uuid(),
      decisions: z.record(z.uuid(), decisionSchema),
    })
  )
  .handler(async ({ context, data }): Promise<RunResponse> => {
    await assertServerPermission(context.session, "donors.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return await runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "import_batch.run",
        metadata: {
          decisionCount: Object.keys(data.decisions).length,
          // Existing donors accepted with "Fill missing details" left on.
          fillMissingCount: Object.values(data.decisions).filter(
            (d) => d.donor?.startsWith("party:") && d.fillMissing !== false
          ).length,
        },
        target: { id: data.batchId, type: "import_batch" },
      },
      async () => await runImportBatch(data, session.user.id)
    );
  });
