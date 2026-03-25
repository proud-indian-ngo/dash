import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/middleware/auth";

export const getPermissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    if (!context.session) {
      return [];
    }
    const role = context.session.user.role ?? "unoriented_volunteer";
    return await resolvePermissions(role);
  });
