import { isWhatsAppConfigured, listJoinedGroups } from "@pi-dash/whatsapp";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import { assertServerPermission } from "@/lib/api-auth";
import { authMiddleware } from "@/middleware/auth";

export const fetchWhatsAppGroups = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await assertServerPermission(context.session, "settings.whatsapp_groups");

    if (!isWhatsAppConfigured()) {
      return { configured: false as const, groups: [] };
    }

    const log = createRequestLogger({
      method: "GET",
      path: "/whatsapp-groups",
    });
    log.set({
      handler: "fetchWhatsAppGroups",
      userId: context.session?.user.id,
    });

    try {
      const groups = await listJoinedGroups();
      log.set({ groupCount: groups.length });
      log.emit();
      return { configured: true as const, groups };
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      log.emit();
      throw error;
    }
  });
