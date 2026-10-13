import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { notesKeysSchema } from "@/lib/razorpay/notes-keys";
import {
  getRazorpaySettingsView,
  RazorpaySettingsError,
  type RazorpaySettingsView,
  saveRazorpaySettings,
} from "@/lib/razorpay/settings";
import { withSafeErrors } from "@/lib/safe-errors";
import { authMiddleware } from "@/middleware/auth";

/**
 * Settings → Integrations → Razorpay. finance.view reads the status (a read,
 * not audited); finance.manage saves the clearing account and notes keys,
 * audited with field names and counts only. Query errors are logged by
 * code only and reach the browser as a generic message.
 */

const safely = <T>(step: "read" | "save", work: () => Promise<T>) =>
  withSafeErrors(
    {
      fields: { event: "razorpay_settings_failed", step },
      isUserFacing: (error) => error instanceof RazorpaySettingsError,
      message:
        step === "read"
          ? "Razorpay settings couldn't be loaded."
          : "Razorpay settings couldn't be saved.",
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

export const updateRazorpaySettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({ clearingAccountId: z.uuid(), notesKeys: notesKeysSchema })
  )
  .handler(
    async ({ context, data }): Promise<{ attachedBatchCount: number }> => {
      await assertServerPermission(context.session, "finance.manage");
      if (!context.session) {
        throw new Error("Unauthorized");
      }
      return await runSessionAuditedAction(
        context.session,
        context.headers,
        {
          action: "razorpay_settings.update",
          metadata: { changedFields: ["clearingAccountId", "notesKeys"] },
          target: { type: "razorpay_settings" },
        },
        async () => await safely("save", () => saveRazorpaySettings(data))
      );
    }
  );
