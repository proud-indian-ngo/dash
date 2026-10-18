import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { authMiddleware } from "@/middleware/auth";

export interface UserHoverDetails {
  createdAt: number;
  email: string;
  phone: string | null;
}

interface UserHoverDetailsRow extends UserHoverDetails {
  role: string;
}

interface UserHoverSession {
  user: { id: string; role?: null | string };
}

export interface UserHoverDetailsDeps {
  findUser: (userId: string) => Promise<UserHoverDetailsRow | undefined>;
  resolvePermissions: (role: string) => Promise<readonly string[]>;
}

export async function loadUserHoverDetails(
  userId: string,
  session: UserHoverSession | null,
  deps: UserHoverDetailsDeps
): Promise<UserHoverDetails | null> {
  if (!session) {
    return null;
  }

  const isSelf = session.user.id === userId;
  if (!isSelf) {
    const permissions = await deps.resolvePermissions(
      session.user.role ?? "unoriented_volunteer"
    );
    if (!permissions.includes("users.view")) {
      return null;
    }
  }

  const row = await deps.findUser(userId);
  if (!row || (!isSelf && row.role === "external_user")) {
    return null;
  }
  return {
    createdAt: row.createdAt,
    email: row.email,
    phone: row.phone,
  };
}

export const getUserHoverDetails = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ userId: z.string().min(1).max(128) }))
  .handler(async ({ context, data }) => {
    const [{ db }, { resolvePermissions }, { user }, { eq }] =
      await Promise.all([
        import("@pi-dash/db"),
        import("@pi-dash/db/queries/resolve-permissions"),
        import("@pi-dash/db/schema/auth"),
        import("drizzle-orm"),
      ]);

    return loadUserHoverDetails(data.userId, context.session, {
      findUser: async (userId) => {
        const [row] = await db
          .select({
            createdAt: user.createdAt,
            email: user.email,
            phone: user.phone,
            role: user.role,
          })
          .from(user)
          .where(eq(user.id, userId))
          .limit(1);
        return row
          ? {
              createdAt: row.createdAt.getTime(),
              email: row.email,
              phone: row.phone,
              role: row.role,
            }
          : undefined;
      },
      resolvePermissions,
    });
  });
