import type { PermissionId } from "@pi-dash/db/permissions";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import z from "zod";

import { authMiddleware } from "@/middleware/auth";

interface AuthContext {
  session: { user: { id: string; role?: string | null } } | null;
}

async function ensurePermission(
  context: AuthContext,
  permissionId: PermissionId
) {
  if (!context.session) {
    throw new Error("Unauthorized");
  }
  const role = context.session.user.role ?? "unoriented_volunteer";
  const perms = await resolvePermissions(role);
  if (!perms.includes(permissionId)) {
    throw new Error("Forbidden");
  }
  return context.session;
}

export const triggerWhatsAppGroupScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const session = await ensurePermission(context, "jobs.manage");
    const log = createRequestLogger({
      method: "POST",
      path: "triggerWhatsAppGroupScan",
    });
    log.set({ userId: session.user.id });
    try {
      await enqueue("scan-whatsapp-groups", {
        triggeredAt: new Date().toISOString(),
      });
      log.set({ event: "scan_enqueued" });
      log.emit();
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  });

export const triggerR2Cleanup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ dryRun: z.boolean() }))
  .handler(async ({ data, context }) => {
    const session = await ensurePermission(context, "jobs.manage");
    const log = createRequestLogger({
      method: "POST",
      path: "triggerR2Cleanup",
    });
    log.set({ userId: session.user.id, dryRun: data.dryRun });
    try {
      await enqueue("cleanup-r2-orphans", { dryRun: data.dryRun });
      log.set({ event: "cleanup_enqueued" });
      log.emit();
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  });
