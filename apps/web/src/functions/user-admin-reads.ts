import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import { createServerFn } from "@tanstack/react-start";
import { desc, ne } from "drizzle-orm";

import { HttpError } from "@/lib/http-error";
import { authMiddleware } from "@/middleware/auth";

export interface AdminUser {
  banExpires: number | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: number;
  dob: number | null;
  email: string;
  emailVerified: boolean;
  gender: "female" | "male" | null;
  id: string;
  image: string | null;
  isActive: boolean;
  isOnWhatsapp: boolean;
  name: string;
  phone: string | null;
  registrationGroup: string | null;
  role: string;
  updatedAt: number;
}

interface AdminUserReadContext {
  session: { user: { role?: string | null } } | null;
}

interface AdminUserReadDeps {
  listUsers: () => Promise<AdminUser[]>;
  resolvePermissions: (role: string) => Promise<readonly string[]>;
}

async function listAdminUsers(): Promise<AdminUser[]> {
  const rows = await db
    .select({
      banExpires: user.banExpires,
      banned: user.banned,
      banReason: user.banReason,
      createdAt: user.createdAt,
      dob: user.dob,
      email: user.email,
      emailVerified: user.emailVerified,
      gender: user.gender,
      id: user.id,
      image: user.image,
      isActive: user.isActive,
      isOnWhatsapp: user.isOnWhatsapp,
      name: user.name,
      phone: user.phone,
      registrationGroup: user.registrationGroup,
      role: user.role,
      updatedAt: user.updatedAt,
    })
    .from(user)
    .where(ne(user.role, "external_user"))
    .orderBy(desc(user.createdAt));

  return rows.map((row) => ({
    ...row,
    banExpires: row.banExpires?.getTime() ?? null,
    createdAt: row.createdAt.getTime(),
    dob: row.dob?.getTime() ?? null,
    updatedAt: row.updatedAt.getTime(),
  }));
}

export async function getAdminUsersWithDeps(
  context: AdminUserReadContext,
  deps: AdminUserReadDeps
): Promise<AdminUser[]> {
  if (!context.session) {
    throw new HttpError(401, "Unauthorized");
  }

  const role = context.session.user.role ?? "unoriented_volunteer";
  const permissions = await deps.resolvePermissions(role);
  if (!permissions.includes("users.manage")) {
    throw new HttpError(403, "Forbidden");
  }

  return await deps.listUsers();
}

export const getAdminUsers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    getAdminUsersWithDeps(context, {
      listUsers: listAdminUsers,
      resolvePermissions,
    })
  );
