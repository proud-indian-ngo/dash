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
  type SignInReactivationResult,
} from "./reactivation";

type SignInReactivationStatus = SignInReactivationResult["status"];

const REACTIVATION_LOG_PAYLOADS = {
  "already-active": { event: "already_active" },
  "missing-user": { warning: "signed-in user not found in database" },
  reactivated: { event: "reactivated_on_login" },
  "skipped-banned": { event: "skip_banned_user" },
  "update-skipped": { event: "reactivation_update_skipped" },
} satisfies Record<
  SignInReactivationStatus,
  { event?: string; warning?: string }
>;

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
  const { returned } = ctx.context;
  const user = getUserFromReturnedBody(returned);

  if (!user?.id) {
    if (returned) {
      const body =
        returned && typeof returned === "object" && "body" in returned
          ? (returned as { body?: unknown }).body
          : undefined;
      const log = createRequestLogger();
      log.set({
        bodyShape: body ? Object.keys(body as object) : "no body",
        hook: "afterSignUp",
        warning: "sign-up returned response but user.id is missing",
      });
      log.emit();
    }
    return;
  }

  const userId = user.id;

  withFireAndForgetLog({ hook: "afterSignUp", userId }, async () => {
    if (user.email) {
      await enqueue("notify-user-welcome", {
        email: user.email,
        name: user.name ?? user.email,
        userId,
      });
    }
  });

  withFireAndForgetLog(
    { action: "orientationGroup", hook: "afterSignUp", userId },
    async () => {
      await enqueue("whatsapp-manage-orientation", {
        isOriented: false,
        userId,
      });
    }
  );
}

async function handleAfterSignIn(ctx: AuthHookContext): Promise<void> {
  const userId = getUserIdFromNewSession(ctx.context.newSession);
  if (!userId) {
    const log = createRequestLogger();
    log.set({
      hasNewSession: ctx.context.newSession !== null,
      hook: "afterSignIn",
      path: ctx.path,
      warning: "sign-in succeeded but newSession userId is missing",
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
            action: "restoreDefaultWhatsAppGroup",
            hook: "afterSignIn",
            isOriented,
            userId: targetUserId,
          },
          async () => {
            await enqueue("whatsapp-manage-orientation", {
              isOriented,
              userId: targetUserId,
            });
          }
        );
      },
    });

    const payload = REACTIVATION_LOG_PAYLOADS[result.status];
    log.set("role" in result ? { ...payload, role: result.role } : payload);

    log.emit();
  } catch (caughtError) {
    log.set({
      error:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
    });
    log.warn("Failed to handle sign-in reactivation");
    log.emit();
  }
}

export const auth = betterAuth({
  advanced: {
    ...(env.COOKIE_DOMAIN && {
      crossSubDomainCookies: {
        domain: env.COOKIE_DOMAIN,
        enabled: true,
      },
    }),
  },
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
            { hook: "afterUserUpdate", phone, userId: user.id },
            async () => {
              await enqueue("sync-whatsapp-status", { phone, userId: user.id });
            }
          );
        },
      },
    },
  },
  emailAndPassword: {
    disableSignUp: false,
    enabled: true,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },
  emailVerification: {
    sendOnSignIn: true,
    sendVerificationEmail: async (data) => {
      const url = `${env.BETTER_AUTH_URL}/verify-email?token=${data.token}`;
      await sendVerificationEmail(data.user.email, url);
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
  plugins: [
    tanstackStartCookies(),
    // Custom roles (e.g. team_lead) are NOT registered here — Better Auth only
    // needs to know about its access-control tiers (admin vs user). Custom roles
    // are stored in user.role and resolved to permissions via resolvePermissions().
    admin({
      adminRoles: ["super_admin", "admin", "finance_admin"],
      defaultRole: "unoriented_volunteer",
      roles: {
        admin: adminAc,
        finance_admin: adminAc,
        super_admin: adminAc,
        unoriented_volunteer: userAc,
        volunteer: userAc,
      },
    }),
  ],
  rateLimit: {
    customRules: {
      "/forgot-password": { max: 5, window: 60 },
      "/reset-password": { max: 5, window: 60 },
      "/sign-in/email": { max: 10, window: 60 },
      "/sign-up/email": { max: 5, window: 60 },
      "/verify-email": { max: 10, window: 60 },
    },
    max: 100,
    window: 60,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  trustedOrigins: [env.CORS_ORIGIN],
  user: {
    additionalFields: {
      dob: {
        required: false,
        type: "date",
      },
      gender: {
        required: false,
        type: "string",
      },
      isActive: {
        defaultValue: true,
        input: false,
        required: false,
        type: "boolean",
      },
      isOnWhatsapp: {
        defaultValue: false,
        input: false,
        required: false,
        type: "boolean",
      },
      phone: {
        required: false,
        type: "string",
      },
      role: {
        defaultValue: "unoriented_volunteer",
        input: false,
        required: false,
        type: "string",
      },
    },
  },
});
