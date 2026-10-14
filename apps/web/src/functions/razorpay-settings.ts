import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { notesKeysSchema } from "@/lib/razorpay/notes-keys";
import { daysBetween, isRealIsoDay } from "@/lib/razorpay/reconcile";
import {
  getRazorpaySettingsView,
  RazorpaySettingsError,
  type RazorpaySettingsView,
  requestRazorpayReconcile,
  saveRazorpaySettings,
} from "@/lib/razorpay/settings";
import { withSafeErrors } from "@/lib/safe-errors";
import { authMiddleware } from "@/middleware/auth";

/**
 * Settings → Integrations → Razorpay. finance.view reads the status (a read,
 * not audited); finance.manage saves the clearing account, the notes keys
 * or both, audited with the changed field names only, and queues a sync
 * ("Sync now", `razorpay.sync`) or an import of past payments
 * (`razorpay.backfill`), audited with the window's dates and day count.
 * Sync now without the key secret only syncs payments stuck in the queue.
 * Query errors are logged by code only and reach the browser as a generic
 * message.
 */

const MESSAGES = {
  read: "Razorpay settings couldn't be loaded.",
  save: "Razorpay settings couldn't be saved.",
  sync: "The Razorpay sync couldn't be started.",
} as const;

const safely = <T>(step: keyof typeof MESSAGES, work: () => Promise<T>) =>
  withSafeErrors(
    {
      fields: { event: "razorpay_settings_failed", step },
      isUserFacing: (error) => error instanceof RazorpaySettingsError,
      message: MESSAGES[step],
      path: "razorpay-settings",
    },
    work
  );

export const getRazorpaySettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RazorpaySettingsView> => {
    await assertServerPermission(context.session, "finance.view");
    return await safely("read", getRazorpaySettingsView);
  });

const settingsInput = z
  .object({
    clearingAccountId: z.uuid().optional(),
    notesKeys: notesKeysSchema.optional(),
  })
  .refine(
    (input) => input.clearingAccountId !== undefined || input.notesKeys,
    "Nothing to save"
  );

export const updateRazorpaySettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(settingsInput)
  .handler(
    async ({
      context,
      data,
    }): Promise<{ attachedBatchCount: number; requeuedCount: number }> => {
      await assertServerPermission(context.session, "finance.manage");
      if (!context.session) {
        throw new Error("Unauthorized");
      }
      const changedFields = (
        ["clearingAccountId", "notesKeys"] as const
      ).filter((field) => data[field] !== undefined);
      return await runSessionAuditedAction(
        context.session,
        context.headers,
        {
          action: "razorpay_settings.update",
          metadata: { changedFields },
          target: { type: "razorpay_settings" },
        },
        async () => await safely("save", () => saveRazorpaySettings(data))
      );
    }
  );

export interface ReconcileQueued {
  days: number;
  from: string;
  to: string;
}

/** Sync now: queues a reconcile of the last three days. */
export const syncRazorpayNow = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<ReconcileQueued> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "razorpay.sync",
        target: { type: "razorpay_settings" },
      },
      async () =>
        await safely("sync", () =>
          requestRazorpayReconcile({ reason: "manual" })
        )
    );
  });

/** A real calendar day, so 2026-02-31 is refused before anything runs. */
const isoDay = z.string().refine(isRealIsoDay, "Not a real date");

/** Import past payments: queues a reconcile of a chosen range of India days. */
export const importPastRazorpayPayments = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ from: isoDay, to: isoDay }))
  .handler(async ({ context, data }): Promise<ReconcileQueued> => {
    await assertServerPermission(context.session, "finance.manage");
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "razorpay.backfill",
        metadata: {
          days: daysBetween(data.from, data.to).length,
          from: data.from,
          to: data.to,
        },
        target: { type: "razorpay_settings" },
      },
      async () =>
        await safely("sync", () =>
          requestRazorpayReconcile({
            from: data.from,
            reason: "backfill",
            to: data.to,
          })
        )
    );
  });
