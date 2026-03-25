import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import { authMiddleware } from "@/middleware/auth";

export const getPermissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      return [];
    }
    const role = context.session.user.role ?? "unoriented_volunteer";
    const userId = context.session.user.id;

    try {
      return await resolvePermissions(role);
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "getPermissions",
        userId,
        role,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "resolve-permissions",
      });
      log.emit();
      return [];
    }
  });
