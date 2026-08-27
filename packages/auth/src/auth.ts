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
import { enrollUserOnRegisterEvent } from "./register-event";
import { createDbRegisterEventEnrollDeps } from "./register-event-db";
import { getUserFromSignUpReturned, verifyPersistedSignUpUser } from "./sign-up-returned";

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
  body?: Record<string, unknown>;
  context: {
    newSession?: unknown;
    returned?: unknown;
  };
  headers?: unknown;
  path: string;
  query?: Record<string, unknown>;
  request?: Request;
}

async function resolveSignedUpUser(
  ctx: AuthHookContext
): Promise<{ email?: string; id?: string; name?: string } | undefined> {
  const fromReturned = getUserFromSignUpReturned(ctx.context.returned);
  return await verifyPersistedSignUpUser(fromReturned, async (email) => {
    const [row] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1);
    return row;
  });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitizeRegistrationGroup(body: Record<string, unknown>): void {
  const group = body.registrationGroup;
  if (typeof group !== "string") {
    delete body.registrationGroup;
    return;
  }
  const trimmed = group.trim();
  if (trimmed.length >= 1 && trimmed.length <= 100) {
    body.registrationGroup = trimmed;
  } else {
    delete body.registrationGroup;
  }
}

function sanitizeSignUpBody(ctx: AuthHookContext): void {
  if (ctx.path !== "/sign-up/email" || !ctx.body) {
    return;
  }
  sanitizeRegistrationGroup(ctx.body);
  const eventId =
    typeof ctx.body.registerEventId === "string"
      ? ctx.body.registerEventId.trim()
      : "";
  if (eventId && UUID_RE.test(eventId)) {
    ctx.body.registerEventId = eventId;
  } else {
    delete ctx.body.registerEventId;
  }
}

function stripRegistrationGroupFromUpdate(ctx: AuthHookContext): void {
  if (ctx.path === "/update-user" && ctx.body?.registrationGroup !== undefined) {
    delete ctx.body.registrationGroup;
  }
}

async function handleAfterSignUp(ctx: AuthHookContext): Promise<void> {
  const user = await resolveSignedUpUser(ctx);

  if (!user?.id) {
    if (ctx.context.returned) {
      const returned = ctx.context.returned;
      const log = createRequestLogger();
      log.set({
        returnedKeys:
          returned && typeof returned === "object"
            ? Object.keys(returned)
            : typeof returned,
        hook: "afterSignUp",
        warning: "sign-up returned response but user.id is missing",
      });
      log.emit();
    }
    return;
  }

  const userId = user.id;
  const registerEventId = getRegisterEventId(ctx);

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

  if (registerEventId) {
    withFireAndForgetLog(
      {
        action: "registerEventEnroll",
        eventId: registerEventId,
        hook: "afterSignUp",
        userId,
      },
      async () => {
        await enrollUserOnRegisterEvent(createDbRegisterEventEnrollDeps(), {
          eventId: registerEventId,
          now: Date.now(),
          userId,
        });
      }
    );
  }
}

function getHeaderValue(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== "object") {
    return;
  }
  if (typeof (headers as Headers).get === "function") {
    return (headers as Headers).get(name) ?? undefined;
  }
  const record = headers as Record<string, unknown>;
  const value = record[name] ?? record[name.toLowerCase()];
  return typeof value === "string" ? value : undefined;
}

function getRegisterEventId(ctx: AuthHookContext): string | undefined {
  const fromBody =
    typeof ctx.body?.registerEventId === "string"
      ? ctx.body.registerEventId
      : undefined;
  const raw =
    fromBody ??
    getHeaderValue(ctx.headers, "x-register-event-id") ??
    getHeaderValue(ctx.request?.headers, "x-register-event-id");
  if (!raw) {
    return;
  }
  const eventId = raw.trim();
  if (!UUID_RE.test(eventId)) {
    return;
  }
  return eventId;
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
        await handleAfterSignUp(ctx);
        return;
      }

      if (ctx.path !== "/sign-in/email") {
        return;
      }

      await handleAfterSignIn(ctx);
    }),
    before: createAuthMiddleware(async (ctx) => {
      sanitizeSignUpBody(ctx);
      stripRegistrationGroupFromUpdate(ctx);
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
        external_user: userAc,
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
      registrationGroup: {
        input: true,
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
