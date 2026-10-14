import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import {
  createPayoutBatch,
  getPayoutReview,
  runPayoutBatch,
} from "@/lib/give-do-payout/server";
import {
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
} from "@/lib/income-import/fields";
import { countChosenFills } from "@/lib/income-import/server";
import { authMiddleware } from "@/middleware/auth";

const decisionSchema = z.object({
  contribution: z.enum(["import", "skip"]).optional(),
  donor: z.string().max(80).optional(),
  fillMissing: z.boolean().optional(),
});

export const createGiveDoPayoutImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      base64: z
        .string()
        .min(1)
        .max(Math.ceil(MAX_IMPORT_FILE_BYTES / 3) * 4)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      fileName: z.string().trim().min(1).max(200),
      fundId: z.uuid(),
      orgAccountId: z.uuid(),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.manage");
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    return runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "import_batch.create",
        metadata: {},
        target: { type: "import_batch" },
      },
      () => createPayoutBatch(data, session.user.id),
      undefined,
      (result) => ({ id: result.review.batch.id, type: "import_batch" })
    );
  });

export const getGiveDoPayoutImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ batchId: z.uuid() }))
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.manage");
    await assertServerPermission(context.session, "finance.manage");
    return getPayoutReview(data.batchId);
  });

export const runGiveDoPayoutImport = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      batchId: z.uuid(),
      decisions: z
        .record(z.uuid(), decisionSchema)
        .refine((value) => Object.keys(value).length <= MAX_IMPORT_ROWS),
      importUnknown: z.boolean(),
      settledOn: z.iso.date(),
    })
  )
  .handler(async ({ context, data }) => {
    await assertServerPermission(context.session, "donors.manage");
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    const { session } = context;
    const fillMissingCount = data.importUnknown
      ? await countChosenFills(data)
      : 0;
    return runSessionAuditedAction(
      session,
      context.headers,
      {
        action: "import_batch.run",
        metadata: {
          decisionCount: Object.keys(data.decisions).length,
          fillMissingCount,
        },
        target: { id: data.batchId, type: "import_batch" },
      },
      () => runPayoutBatch(data, session.user.id)
    );
  });
