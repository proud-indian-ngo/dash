import { db } from "@pi-dash/db";
// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "@pi-dash/db/schema/auth";
import { sendResetPasswordEmail, sendVerificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  databaseHooks: {
    user: {
      update: {
        after: async (user) => {
          const { syncWhatsAppStatus } = await import("@pi-dash/whatsapp");
          const phone = typeof user.phone === "string" ? user.phone : undefined;
          withFireAndForgetLog(
            { hook: "afterUserUpdate", userId: user.id, phone },
            () => syncWhatsAppStatus(user.id, phone)
          );
        },
      },
    },
  },
  trustedOrigins: [env.CORS_ORIGIN],
  rateLimit: {
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/forgot-password": { window: 60, max: 5 },
      "/reset-password": { window: 60, max: 5 },
      "/verify-email": { window: 60, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
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
      attendedOrientation: {
        type: "boolean",
        required: false,
        defaultValue: false,
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
        defaultValue: "volunteer",
        input: false,
      },
    },
  },
  plugins: [
    tanstackStartCookies(),
    admin({
      defaultRole: "volunteer",
      adminRoles: ["admin"],
      roles: {
        admin: adminAc,
        volunteer: userAc,
      },
    }),
  ],
  advanced: env.COOKIE_DOMAIN
    ? {
        crossSubDomainCookies: {
          enabled: true,
          domain: env.COOKIE_DOMAIN,
        },
      }
    : undefined,
});
