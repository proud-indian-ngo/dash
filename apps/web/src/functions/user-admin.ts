import { auth } from "@pi-dash/auth";
import {
  notifyRoleChanged,
  notifyUserBanned,
  notifyUserUnbanned,
  notifyUserWelcome,
  syncCourierUser,
} from "@pi-dash/notifications";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { manageOrientationGroupMembership } from "@pi-dash/whatsapp";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";
import { optionalDate } from "@/lib/validators";
import { authMiddleware } from "@/middleware/auth";

const MIN_PASSWORD_LENGTH = 8;

const roleSchema = z.enum(["admin", "volunteer"]);
const genderSchema = z.enum(["male", "female"]);

const createUserSchema = z.object({
  attendedOrientation: z.boolean().default(false),
  dob: optionalDate.optional(),
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
  attendedOrientation: z.boolean().optional(),
  dob: optionalDate.optional(),
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

const normalizeOptionalString = (value?: string): string | undefined => {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

const toDate = (value?: string): Date | undefined => {
  if (!value) {
    return undefined;
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.valueOf())) {
    throw new Error("Invalid date value");
  }

  return parsedDate;
};

const toBanExpiresInSeconds = (value?: string): number | undefined => {
  const expiresAt = toDate(value);

  if (!expiresAt) {
    return undefined;
  }

  const deltaMs = expiresAt.valueOf() - Date.now();
  if (deltaMs <= 0) {
    throw new Error("Ban expiry must be in the future");
  }

  return Math.ceil(deltaMs / 1000);
};

function ensureAdminContext(
  context: AdminContext
): asserts context is AdminContextWithSession {
  if (!context.session) {
    throw new Error("Unauthorized");
  }

  if (context.session.user.role !== "admin") {
    throw new Error("Forbidden");
  }
}

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
    ensureAdminContext(context);

    const normalizedEmail = data.email.toLowerCase();
    const created = await auth.api.createUser({
      body: {
        email: normalizedEmail,
        name: data.name,
        password: data.password,
        role: data.role,
      },
      headers: context.headers,
    });

    await auth.api.adminUpdateUser({
      body: {
        data: {
          attendedOrientation: data.attendedOrientation,
          dob: toDate(data.dob),
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
        role: data.role,
        userId: created.user.id,
      },
      headers: context.headers,
    });

    // Fire-and-forget: sync user to Courier, then send welcome notification
    // (welcome must wait for sync so the email channel is registered)
    withFireAndForgetLog(
      {
        handler: "createUser",
        userId: created.user.id,
        email: normalizedEmail,
        name: data.name,
      },
      () =>
        syncCourierUser({
          userId: created.user.id,
          email: normalizedEmail,
          name: data.name,
        }).then(() =>
          notifyUserWelcome({ userId: created.user.id, name: data.name })
        )
    );

    // Fire-and-forget: add new volunteer to orientation WhatsApp group
    if (data.role === "volunteer" && !data.attendedOrientation) {
      withFireAndForgetLog(
        { handler: "createUser", userId: created.user.id, role: data.role },
        () => manageOrientationGroupMembership(created.user.id, false)
      );
    }

    return created.user.id;
  });

export const updateUserAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(updateUserSchema)
  .handler(async ({ context, data }) => {
    ensureAdminContext(context);

    // Fetch current user to detect actual changes
    const currentUsers = await auth.api.listUsers({
      query: {
        filterField: "id",
        filterOperator: "eq",
        filterValue: data.userId,
      },
      headers: context.headers,
    });
    const currentUser = currentUsers.users[0];
    if (!currentUser) {
      throw new Error("User not found");
    }
    const previousRole = currentUser.role;
    const previousAttendedOrientation = (
      currentUser as { attendedOrientation?: boolean }
    ).attendedOrientation;

    const normalizedEmail = data.email.toLowerCase();
    await auth.api.adminUpdateUser({
      body: {
        data: {
          attendedOrientation: data.attendedOrientation,
          dob: toDate(data.dob),
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
          role: newRole,
          userId: data.userId,
        },
        headers: context.headers,
      });

      // Fire-and-forget: notify role change
      withFireAndForgetLog(
        { handler: "updateUser", userId: data.userId, newRole },
        () => notifyRoleChanged({ userId: data.userId, newRole })
      );
    }

    // Fire-and-forget: sync updated profile to Courier
    withFireAndForgetLog(
      {
        handler: "updateUser",
        userId: data.userId,
        email: normalizedEmail,
        name: data.name,
      },
      () =>
        syncCourierUser({
          userId: data.userId,
          email: normalizedEmail,
          name: data.name,
        })
    );

    // Fire-and-forget: manage WhatsApp group membership on orientation change
    // Only applies to volunteers, not admins
    const effectiveRole = data.role ?? previousRole;
    if (
      effectiveRole === "volunteer" &&
      data.attendedOrientation !== undefined &&
      data.attendedOrientation !== previousAttendedOrientation
    ) {
      withFireAndForgetLog(
        {
          handler: "updateUser",
          userId: data.userId,
          attendedOrientation: data.attendedOrientation,
        },
        () =>
          manageOrientationGroupMembership(
            data.userId,
            data.attendedOrientation as boolean
          )
      );
    }

    return data.userId;
  });

export const setUserPasswordAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(setUserPasswordSchema)
  .handler(async ({ context, data }) => {
    ensureAdminContext(context);

    await auth.api.setUserPassword({
      body: {
        newPassword: data.newPassword,
        userId: data.userId,
      },
      headers: context.headers,
    });

    return data.userId;
  });

export const deleteUserAdmin = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(deleteUserSchema)
  .handler(async ({ context, data }) => {
    ensureAdminContext(context);

    if (context.session.user.id === data.userId) {
      throw new Error("You cannot delete your own account");
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
    ensureAdminContext(context);

    if (context.session.user.id === data.userId && data.banned) {
      throw new Error("You cannot ban your own account");
    }

    await setBanState({
      context,
      userId: data.userId,
      banned: data.banned,
      banReason: data.banReason,
      banExpires: data.banExpires,
    });

    // Fire-and-forget: notify ban/unban
    if (data.banned) {
      withFireAndForgetLog(
        {
          handler: "setUserBan",
          userId: data.userId,
          banned: true,
          banReason: data.banReason,
        },
        () => notifyUserBanned({ userId: data.userId, reason: data.banReason })
      );
    } else {
      withFireAndForgetLog(
        { handler: "setUserBan", userId: data.userId, banned: false },
        () => notifyUserUnbanned({ userId: data.userId })
      );
    }

    return data.userId;
  });
