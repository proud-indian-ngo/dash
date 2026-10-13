import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { notesKeysSchema } from "@/lib/razorpay/notes-keys";
import {
  getRazorpaySettingsView,
  type RazorpaySettingsView,
  saveRazorpaySettings,
} from "@/lib/razorpay/settings";
import { authMiddleware } from "@/middleware/auth";

/**
 * Settings → Integrations → Razorpay. finance.view reads the status (a read,
 * not audited); finance.manage saves the clearing account and notes keys,
 * audited with field names and counts only.
 */

export const getRazorpaySettings = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<RazorpaySettingsView> => {
    await assertServerPermission(context.session, "finance.view");
    return await getRazorpaySettingsView();
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
        async () => await saveRazorpaySettings(data)
      );
    }
  );
