import type { PermissionId } from "@pi-dash/db/permissions";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import z from "zod";

import { runSessionAuditedAction } from "@/lib/audit";
import { authMiddleware } from "@/middleware/auth";

interface AuthContext {
  headers: Headers;
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
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      { action: "admin.whatsapp_group_scan.trigger" },
      async () => {
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
      }
    );
  });

export const triggerR2Cleanup = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ dryRun: z.boolean() }))
  .handler(async ({ data, context }) => {
    if (!context.session) {
      throw new Error("Unauthorized");
    }
    return await runSessionAuditedAction(
      context.session,
      context.headers,
      {
        action: "admin.r2_cleanup.trigger",
        metadata: { dryRun: data.dryRun },
      },
      async () => {
        const session = await ensurePermission(context, "jobs.manage");
        const log = createRequestLogger({
          method: "POST",
          path: "triggerR2Cleanup",
        });
        log.set({ dryRun: data.dryRun, userId: session.user.id });
        try {
          await enqueue("cleanup-r2-orphans", { dryRun: data.dryRun });
          log.set({ event: "cleanup_enqueued" });
          log.emit();
        } catch (error) {
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          throw error;
        }
      }
    );
  });
