import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import { teamMember } from "@pi-dash/db/schema/team";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { authMiddleware } from "@/middleware/auth";

export interface PickerUser {
  email: string;
  id: string;
  image: string | null;
  isActive: boolean;
  name: string;
  role: string;
}

/**
 * Returns a minimal user list for pickers/selectors.
 * Accessible to users with `users.view` permission OR any team lead.
 * Only returns fields needed by UserPicker — no personal data (phone, DOB, gender, ban info).
 */
export const getUsersForPicker = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<PickerUser[]> => {
    if (!context.session) {
      return [];
    }

    const userId = context.session.user.id;
    const role = context.session.user.role ?? "unoriented_volunteer";

    const permissions = await resolvePermissions(role);
    const hasUsersView = permissions.includes("users.view");

    if (!hasUsersView) {
      // Check if user is a team lead
      const [leadRow] = await db
        .select({ userId: teamMember.userId })
        .from(teamMember)
        .where(and(eq(teamMember.userId, userId), eq(teamMember.role, "lead")))
        .limit(1);

      if (!leadRow) {
        return [];
      }
    }

    try {
      const rows = await db
        .select({
          email: user.email,
          id: user.id,
          image: user.image,
          isActive: user.isActive,
          name: user.name,
          role: user.role,
        })
        .from(user);

      return rows;
    } catch (error) {
      const log = createRequestLogger();
      log.set({ handler: "getUsersForPicker", role, userId });
      log.error(error instanceof Error ? error : String(error), {
        step: "query-users",
      });
      log.emit();
      return [];
    }
  });
