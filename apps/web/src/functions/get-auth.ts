import { hasOutstandingPolicies } from "@pi-dash/db/queries/policies";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { todayInKolkata } from "@pi-dash/shared/income";
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
      const [permissions, policiesPending] = await Promise.all([
        resolvePermissions(role),
        // The policy register's "everyone" leaves out Kalakriti's external accounts.
        role === "external_user"
          ? false
          : hasOutstandingPolicies(userId, todayInKolkata()),
      ]);
      return { permissions, policiesPending, session: context.session };
    } catch (error) {
      const log = createRequestLogger();
      log.set({
        handler: "getAuth",
        role,
        userId,
      });
      log.error(error instanceof Error ? error : String(error), {
        step: "resolve-auth",
      });
      log.emit();
      // Rethrow: empty permissions would read as access denied, and the
      // client would cache that lockout for five minutes.
      throw error;
    }
  });
