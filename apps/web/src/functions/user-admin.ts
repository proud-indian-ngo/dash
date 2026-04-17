import { auth } from "@pi-dash/auth";
import { db } from "@pi-dash/db";
import type { PermissionId } from "@pi-dash/db/permissions";
import { ADMIN_TIER_ROLES } from "@pi-dash/db/permissions";
import {
  invalidatePermissionCache,
  resolvePermissions,
} from "@pi-dash/db/queries/resolve-permissions";
import { user } from "@pi-dash/db/schema/auth";
import { role } from "@pi-dash/db/schema/permission";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { notifyUserDeleted } from "@pi-dash/notifications/send/user";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import z from "zod";

import { getUserAdminWhatsappSyncPlan } from "@/functions/user-admin-whatsapp";
import { authMiddleware } from "@/middleware/auth";

const MIN_PASSWORD_LENGTH = 8;

const BETTER_AUTH_ROLES = ["admin", "volunteer"] as const;
type BetterAuthRole = (typeof BETTER_AUTH_ROLES)[number];

/** Better Auth only understands "admin" | "volunteer". Map admin-tier roles to "admin". */
function toBetterAuthRole(role: string): BetterAuthRole {
  if (ADMIN_TIER_ROLES.has(role)) {
    return "admin";
  }
  return "volunteer";
}

const roleSchema = z.string().min(1, "Role is required");
const genderSchema = z.enum(["male", "female"]);

const createUserSchema = z.object({
  dob: z.coerce.date().optional(),
  email: z.email("Invalid email address"),
  emailVerified: z.boolean().default(false),
  gender: genderSchema.optional(),
  isActive: z.boolean().default(true),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(MIN_PASSWORD_LENGTH),
  phone: z.string().optional(),
  role: roleSchema.default("volunteer"),
});

const updateUserSchema = z.object({
  dob: z.coerce.date().optional(),
  email: z.email("Invalid email address"),
  emailVerified: z.boolean().optional(),
  gender: genderSchema.optional(),
  isActive: z.boolean().optional(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().optional(),
  role: roleSchema.optional(),
  userId: z.string().min(1),
});

const setUserPasswordSchema = z.object({
  newPassword: z.string().min(MIN_PASSWORD_LENGTH),
  userId: z.string().min(1),
});

const deleteUserSchema = z.object({
  userId: z.string().min(1),
});

const setUserBanSchema = z.object({
  banExpires: z.string().optional(),
  banReason: z.string().optional(),
  banned: z.boolean(),
  userId: z.string().min(1),
});

export type AdminSetUserBanInput = z.infer<typeof setUserBanSchema>;
export type AdminSetUserPasswordInput = z.infer<typeof setUserPasswordSchema>;

interface AdminContext {
  headers: Headers;
  session: Awaited<ReturnType<typeof auth.api.getSession>>;
}

interface AdminContextWithSession extends AdminContext {
  session: NonNullable<AdminContext["session"]>;
}

async function ensurePermission(
  context: AdminContext,
  permissionId: PermissionId
): Promise<AdminContextWithSession> {
  if (!context.session) {
    throw new Error("Unauthorized");
  }
  const role = context.session.user.role ?? "unoriented_volunteer";
  const perms = await resolvePermissions(role);
  if (!perms.includes(permissionId)) {
    throw new Error("Forbidden");
  }
  return context as AdminContextWithSession;
}

const normalizeOptionalString = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const toBanExpiresInSeconds = (value?: string): number | undefined => {
  const expiresAt = value ? new Date(value) : undefined;

  if (!expiresAt) {
    return undefined;
  }

  const deltaMs = expiresAt.valueOf() - Date.now();
  if (deltaMs <= 0) {
    throw new Error("Ban expiry must be in the future");
  }

  return Math.ceil(deltaMs / 1000);
};

const setBanState = async ({
  context,
  userId,
  banned,
  banReason,
  banExpires,
}: {
  context: AdminContext;
  userId: string;
  banned: boolean;
  banReason: string | undefined;
  banExpires: string | undefined;
}): Promise<void> => {
  if (banned) {
    await auth.api.banUser({
      body: {
        banExpiresIn: toBanExpiresInSeconds(banExpires),
        banReason: normalizeOptionalString(banReason),
        userId,
      },
      headers: context.headers,
    });
    return;
  }

  await auth.api.unbanUser({
    body: { userId },
    headers: context.headers,
  });
};

export const createUserAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(createUserSchema)
  .handler(async ({ context, data }) => {
    await ensurePermission(context, "users.create");

    const normalizedEmail = data.email.toLowerCase();
    const created = await auth.api.createUser({
      body: {
        email: normalizedEmail,
        name: data.name,
        password: data.password,
        role: toBetterAuthRole(data.role),
      },
      headers: context.headers,
    });

    await auth.api.adminUpdateUser({
      body: {
        data: {
          dob: data.dob,
          email: normalizedEmail,
          emailVerified: data.emailVerified,
          gender: normalizeOptionalString(data.gender),
          isActive: data.isActive,
          name: data.name,
          phone: normalizeOptionalString(data.phone),
        },
        userId: created.user.id,
      },
      headers: context.headers,
    });

    await auth.api.setRole({
      body: {
        role: toBetterAuthRole(data.role),
        userId: created.user.id,
      },
      headers: context.headers,
    });

    // Persist the actual custom role ID (Better Auth only stores admin/volunteer)
    await db
      .update(user)
      .set({ role: data.role })
      .where(eq(user.id, created.user.id));

    // Send welcome notification to the new user
    withFireAndForgetLog(
      { handler: "createUser:welcome", userId: created.user.id },
      async () => {
        await enqueue("notify-user-welcome", {
          userId: created.user.id,
          email: normalizedEmail,
          name: data.name,
        });
      }
    );

    // Enqueue orientation WhatsApp group membership if role is unoriented
    if (data.role === "unoriented_volunteer") {
      withFireAndForgetLog(
        { handler: "createUser:orientation", userId: created.user.id },
        async () => {
          await enqueue("whatsapp-manage-orientation", {
            userId: created.user.id,
            isOriented: false,
          });
        }
      );
    }

    return created.user.id;
  });

export const updateUserAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateUserSchema)
  .handler(async ({ context, data }) => {
    await ensurePermission(context, "users.edit");

    // Fetch current user state from the DB to detect actual changes.
    const currentUser = await db
      .select({
        banned: user.banned,
        isActive: user.isActive,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, data.userId))
      .limit(1)
      .then((rows) => rows[0]);
    if (!currentUser) {
      throw new Error("User not found");
    }
    const previousRole = currentUser.role;

    const normalizedEmail = data.email.toLowerCase();
    await auth.api.adminUpdateUser({
      body: {
        data: {
          dob: data.dob,
          email: normalizedEmail,
          emailVerified: data.emailVerified,
          gender: normalizeOptionalString(data.gender),
          isActive: data.isActive,
          name: data.name,
          phone: normalizeOptionalString(data.phone),
        },
        userId: data.userId,
      },
      headers: context.headers,
    });

    if (data.role && data.role !== previousRole) {
      const newRole = data.role;
      await auth.api.setRole({
        body: {
          role: toBetterAuthRole(newRole),
          userId: data.userId,
        },
        headers: context.headers,
      });

      // Persist the actual custom role ID (Better Auth only stores admin/volunteer)
      await db
        .update(user)
        .set({ role: newRole })
        .where(eq(user.id, data.userId));

      // Invalidate permission cache + user sessions so the new role takes effect
      invalidatePermissionCache(newRole);
      invalidatePermissionCache(previousRole ?? undefined);
      await auth.api.revokeUserSessions({
        body: { userId: data.userId },
        headers: context.headers,
      });

      // Look up display name for notification
      const roleRecord = await db
        .select({ name: role.name })
        .from(role)
        .where(eq(role.id, newRole))
        .then((rows) => rows[0]);
      const roleName = roleRecord?.name ?? newRole;

      // Enqueue role change notification
      withFireAndForgetLog(
        {
          handler: "updateUser:roleChanged",
          userId: data.userId,
          newRole: roleName,
        },
        async () => {
          await enqueue("notify-role-changed", {
            userId: data.userId,
            newRole: roleName,
          });
        }
      );
    }

    const whatsappSyncPlan = getUserAdminWhatsappSyncPlan({
      currentBanned: currentUser.banned,
      currentIsActive: currentUser.isActive,
      currentRole: currentUser.role,
      nextIsActive: data.isActive,
      nextRole: data.role,
    });

    if (whatsappSyncPlan.shouldRestoreDefaultGroup) {
      withFireAndForgetLog(
        {
          handler: "updateUser:defaultGroupMembership",
          userId: data.userId,
          previousRole: currentUser.role,
          nextRole: whatsappSyncPlan.effectiveRole,
          becameActive: whatsappSyncPlan.becameActive,
          isOriented: whatsappSyncPlan.isOriented,
        },
        async () => {
          await enqueue("whatsapp-manage-orientation", {
            userId: data.userId,
            isOriented: whatsappSyncPlan.isOriented,
          });
        }
      );
    }

    return data.userId;
  });

export const setUserPasswordAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(setUserPasswordSchema)
  .handler(async ({ context, data }) => {
    await ensurePermission(context, "users.set_password");

    await auth.api.setUserPassword({
      body: {
        newPassword: data.newPassword,
        userId: data.userId,
      },
      headers: context.headers,
    });

    withFireAndForgetLog(
      { handler: "setUserPassword:notify", userId: data.userId },
      async () => {
        await enqueue("notify-password-reset", { userId: data.userId });
      }
    );

    return data.userId;
  });

export const deleteUserAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteUserSchema)
  .handler(async ({ context, data }) => {
    const authed = await ensurePermission(context, "users.delete");

    if (authed.session.user.id === data.userId) {
      throw new Error("You cannot delete your own account");
    }

    // Called directly (not enqueued) — user must exist when notification is sent,
    // but is deleted immediately after.
    try {
      await notifyUserDeleted({ userId: data.userId });
    } catch {
      // Best-effort: don't block deletion if notification fails
    }

    // Remove from all WhatsApp groups before deletion (membership rows cascade-delete).
    // Best-effort: enqueue failure must not block user deletion.
    try {
      const { getUserPhone } = await import("@pi-dash/whatsapp/users");
      const { getAllGroupJidsForUser } = await import(
        "@pi-dash/whatsapp/groups"
      );
      const [phone, groupJids] = await Promise.all([
        getUserPhone(data.userId),
        getAllGroupJidsForUser(data.userId),
      ]);
      if (phone && groupJids.length > 0) {
        await enqueue("whatsapp-remove-from-all-groups", {
          phone,
          groupJids,
        });
      }
    } catch (error) {
      const log = createRequestLogger({
        method: "POST",
        path: "deleteUser:whatsappRemoval",
      });
      log.set({ userId: data.userId });
      log.error(error instanceof Error ? error : String(error));
      log.emit();
    }

    await auth.api.removeUser({
      body: {
        userId: data.userId,
      },
      headers: context.headers,
    });

    return data.userId;
  });

export const setUserBanAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(setUserBanSchema)
  .handler(async ({ context, data }) => {
    const authed = await ensurePermission(context, "users.ban");

    if (authed.session.user.id === data.userId && data.banned) {
      throw new Error("You cannot ban your own account");
    }

    await setBanState({
      context,
      userId: data.userId,
      banned: data.banned,
      banReason: data.banReason,
      banExpires: data.banExpires,
    });

    // Enqueue ban/unban notification
    if (data.banned) {
      withFireAndForgetLog(
        {
          handler: "setUserBan:banned",
          userId: data.userId,
          banReason: data.banReason,
        },
        async () => {
          await enqueue("notify-user-banned", {
            userId: data.userId,
            reason: data.banReason,
          });
        }
      );
    } else {
      withFireAndForgetLog(
        { handler: "setUserBan:unbanned", userId: data.userId },
        async () => {
          await enqueue("notify-user-unbanned", { userId: data.userId });
        }
      );
    }

    return data.userId;
  });

export const triggerWhatsAppGroupScan = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const ctx = await ensurePermission(context, "users.create");
    const log = createRequestLogger({
      method: "POST",
      path: "triggerWhatsAppGroupScan",
    });
    log.set({ userId: ctx.session.user.id });
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
