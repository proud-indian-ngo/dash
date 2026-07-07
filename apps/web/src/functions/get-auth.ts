import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { createServerFn } from "@tanstack/react-start";
import { createRequestLogger } from "evlog";
import { authMiddleware } from "@/middleware/auth";

export const getAuth = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      return null;
    }

    const role = context.session.user.role ?? "unoriented_volunteer";
    const userId = context.session.user.id;

    try {
      const permissions = await resolvePermissions(role);
      return { permissions, session: context.session };
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "getAuth",
        role,
        userId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "resolve-permissions",
      });
      log.emit();
      return { permissions: [] as string[], session: context.session };
    }
  });
