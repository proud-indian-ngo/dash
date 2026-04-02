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
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";

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
    // biome-ignore lint/suspicious/useAwait: createAuthMiddleware requires async callback
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") {
        return;
      }

      const returned = ctx.context.returned;
      const body =
        returned && typeof returned === "object" && "body" in returned
          ? (returned as { body?: unknown }).body
          : undefined;
      const user =
        body && typeof body === "object" && "user" in body
          ? (body as { user?: { id?: string; email?: string; name?: string } })
              .user
          : undefined;

      if (!user?.id) {
        if (returned) {
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

      // Welcome handler syncs user to Courier before sending notification
      withFireAndForgetLog(
        { hook: "afterSignUp", userId: user.id },
        async () => {
          await enqueue("notify-user-welcome", {
            userId: user.id as string,
            email: user.email ?? "",
            name: user.name ?? "",
          });
        }
      );

      withFireAndForgetLog(
        { hook: "afterSignUp", userId: user.id, action: "orientationGroup" },
        async () => {
          await enqueue("whatsapp-manage-orientation", {
            userId: user.id as string,
            isOriented: false,
          });
        }
      );
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
