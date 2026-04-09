import { db } from "@pi-dash/db";
// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "@pi-dash/db/schema/auth";
import { sendResetPasswordEmail, sendVerificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, eq, isNull, or } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import {
  getUserIdFromNewSession,
  reactivateUserAfterSignIn,
} from "./reactivation";

interface AuthHookContext {
  context: {
    newSession?: unknown;
    returned?: unknown;
  };
  path: string;
}

function getUserFromReturnedBody(
  returned: unknown
): { email?: string; id?: string; name?: string } | undefined {
  const body =
    returned && typeof returned === "object" && "body" in returned
      ? (returned as { body?: unknown }).body
      : undefined;

  return body && typeof body === "object" && "user" in body
    ? (
        body as {
          user?: { id?: string; email?: string; name?: string };
        }
      ).user
    : undefined;
}

function handleAfterSignUp(ctx: AuthHookContext): void {
  const returned = ctx.context.returned;
  const user = getUserFromReturnedBody(returned);

  if (!user?.id) {
    if (returned) {
      const body =
        returned && typeof returned === "object" && "body" in returned
          ? (returned as { body?: unknown }).body
          : undefined;
      const log = createRequestLogger();
      log.set({
        hook: "afterSignUp",
        warning: "sign-up returned response but user.id is missing",
        bodyShape: body ? Object.keys(body as object) : "no body",
      });
      log.emit();
    }
    return;
  }

  const userId = user.id;

  withFireAndForgetLog({ hook: "afterSignUp", userId }, async () => {
    await enqueue("notify-user-welcome", {
      userId,
      email: user.email ?? "",
      name: user.name ?? "",
    });
  });

  withFireAndForgetLog(
    { hook: "afterSignUp", userId, action: "orientationGroup" },
    async () => {
      await enqueue("whatsapp-manage-orientation", {
        userId,
        isOriented: false,
      });
    }
  );
}

async function handleAfterSignIn(ctx: AuthHookContext): Promise<void> {
  const userId = getUserIdFromNewSession(ctx.context.newSession);
  if (!userId) {
    const log = createRequestLogger();
    log.set({
      hook: "afterSignIn",
      path: ctx.path,
      warning: "sign-in succeeded but newSession userId is missing",
      hasNewSession: ctx.context.newSession != null,
    });
    log.emit();
    return;
  }

  const log = createRequestLogger();
  log.set({ hook: "afterSignIn", path: ctx.path, userId });

  try {
    const result = await reactivateUserAfterSignIn(userId, {
      fetchUserState: async (targetUserId) =>
        db
          .select({
            banned: schema.user.banned,
            isActive: schema.user.isActive,
            role: schema.user.role,
          })
          .from(schema.user)
          .where(eq(schema.user.id, targetUserId))
          .limit(1)
          .then((rows) => rows[0]),
      markUserActive: async (targetUserId) => {
        const rows = await db
          .update(schema.user)
          .set({ isActive: true })
          .where(
            and(
              eq(schema.user.id, targetUserId),
              eq(schema.user.isActive, false),
              or(eq(schema.user.banned, false), isNull(schema.user.banned))
            )
          )
          .returning({ id: schema.user.id });
        return rows.length > 0;
      },
      restoreDefaultGroup: ({ isOriented, userId: targetUserId }) => {
        withFireAndForgetLog(
          {
            hook: "afterSignIn",
            userId: targetUserId,
            action: "restoreDefaultWhatsAppGroup",
            isOriented,
          },
          async () => {
            await enqueue("whatsapp-manage-orientation", {
              userId: targetUserId,
              isOriented,
            });
          }
        );
      },
    });

    switch (result.status) {
      case "missing-user":
        log.set({ warning: "signed-in user not found in database" });
        break;
      case "skipped-banned":
        log.set({ event: "skip_banned_user" });
        break;
      case "already-active":
        log.set({ event: "already_active" });
        break;
      case "update-skipped":
        log.set({ event: "reactivation_update_skipped", role: result.role });
        break;
      case "reactivated":
        log.set({ event: "reactivated_on_login", role: result.role });
        break;
      default: {
        const exhaustive: never = result;
        throw new Error(`Unhandled sign-in reactivation result: ${exhaustive}`);
      }
    }

    log.emit();
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    log.emit();
  }
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          const phone = typeof user.phone === "string" ? user.phone.trim() : "";
          if (!phone) {
            return;
          }
          const existing = await db
            .select({ id: schema.user.id })
            .from(schema.user)
            .where(eq(schema.user.phone, phone))
            .limit(1);
          if (existing.length > 0) {
            throw new APIError("BAD_REQUEST", {
              message: "A user with this phone number already exists",
            });
          }
        },
      },
      update: {
        // biome-ignore lint/suspicious/useAwait: better-auth requires async return type
        after: async (user) => {
          const phone = typeof user.phone === "string" ? user.phone : null;
          withFireAndForgetLog(
            { hook: "afterUserUpdate", userId: user.id, phone },
            async () => {
              await enqueue("sync-whatsapp-status", { userId: user.id, phone });
            }
          );
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email") {
        handleAfterSignUp(ctx);
        return;
      }

      if (ctx.path !== "/sign-in/email") {
        return;
      }

      await handleAfterSignIn(ctx);
    }),
  },
  trustedOrigins: [env.CORS_ORIGIN],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/forgot-password": { window: 60, max: 5 },
      "/reset-password": { window: 60, max: 5 },
      "/verify-email": { window: 60, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: false,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },
  emailVerification: {
    sendVerificationEmail: async (data) => {
      const url = `${env.BETTER_AUTH_URL}/verify-email?token=${data.token}`;
      await sendVerificationEmail(data.user.email, url);
    },
    sendOnSignIn: true,
  },
  user: {
    additionalFields: {
      gender: {
        type: "string",
        required: false,
      },
      dob: {
        type: "date",
        required: false,
      },
      phone: {
        type: "string",
        required: false,
      },
      isOnWhatsapp: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "unoriented_volunteer",
        input: false,
      },
    },
  },
  plugins: [
    tanstackStartCookies(),
    // Custom roles (e.g. team_lead) are NOT registered here — Better Auth only
    // needs to know about its access-control tiers (admin vs user). Custom roles
    // are stored in user.role and resolved to permissions via resolvePermissions().
    admin({
      defaultRole: "unoriented_volunteer",
      adminRoles: ["super_admin", "admin", "finance_admin"],
      roles: {
        super_admin: adminAc,
        admin: adminAc,
        finance_admin: adminAc,
        unoriented_volunteer: userAc,
        volunteer: userAc,
      },
    }),
  ],
  advanced: {
    ...(env.COOKIE_DOMAIN && {
      crossSubDomainCookies: {
        enabled: true,
        domain: env.COOKIE_DOMAIN,
      },
    }),
  },
});
