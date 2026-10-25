import { mcp } from "@better-auth/mcp";
import { db } from "@pi-dash/db";
import { isAuthEmailBlocked } from "@pi-dash/db/queries/email-suppression";
// biome-ignore lint/performance/noNamespaceImport: intentional
import * as schema from "@pi-dash/db/schema/auth";
// biome-ignore lint/performance/noNamespaceImport: intentional
import * as oauthSchema from "@pi-dash/db/schema/private/oauth";
import { sendResetPasswordEmail, sendVerificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { enqueue } from "@pi-dash/jobs/enqueue";
import { withFireAndForgetLog } from "@pi-dash/observability";
import { TURNSTILE_ACTIONS } from "@pi-dash/shared/turnstile";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, captcha, emailOTP, jwt } from "better-auth/plugins";
import { adminAc, userAc } from "better-auth/plugins/admin/access";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { and, eq, isNull, or } from "drizzle-orm";
import { createRequestLogger } from "evlog";

import { assertSuppliedAvatarImage } from "./avatar-image";
import { verifyEventSignupLink } from "./event-signup-link";
import {
  getUserIdFromNewSession,
  reactivateUserAfterSignIn,
  type SignInReactivationResult,
} from "./reactivation";
import { enrollUserOnRegisterEvent } from "./register-event";
import { createDbRegisterEventEnrollDeps } from "./register-event-db";
import { signUpDobError } from "./sign-up-age";
import {
  getUserFromSignUpReturned,
  verifyPersistedSignUpUser,
} from "./sign-up-returned";
import { getVerificationEventRedirect } from "./verification-redirect";

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
  const sig =
    typeof ctx.body.registerEventSig === "string"
      ? ctx.body.registerEventSig.trim()
      : "";
  if (eventId && UUID_RE.test(eventId) && sig) {
    ctx.body.registerEventId = eventId;
    ctx.body.registerEventSig = sig;
  } else {
    delete ctx.body.registerEventId;
    delete ctx.body.registerEventSig;
  }
}

function assertSignUpAgeEligible(ctx: AuthHookContext): void {
  if (ctx.path !== "/sign-up/email" || !ctx.body) {
    return;
  }
  const message = signUpDobError(ctx.body.dob, new Date());
  if (message) {
    throw new APIError("BAD_REQUEST", { message });
  }
}

function stripRegistrationGroupFromUpdate(ctx: AuthHookContext): void {
  if (
    ctx.path === "/update-user" &&
    ctx.body?.registrationGroup !== undefined
  ) {
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
    {
      action: "registerEventEnrollAndOrientation",
      eventId: registerEventId,
      hook: "afterSignUp",
      userId,
    },
    async () => {
      try {
        if (registerEventId) {
          await enrollUserOnRegisterEvent(createDbRegisterEventEnrollDeps(), {
            eventId: registerEventId,
            now: Date.now(),
            userId,
          });
        }
      } finally {
        // Enrollment may promote the user; never enqueue a stale unoriented job.
        const [persistedUser] = await db
          .select({ role: schema.user.role })
          .from(schema.user)
          .where(eq(schema.user.id, userId))
          .limit(1);
        if (persistedUser?.role === "unoriented_volunteer") {
          await enqueue("whatsapp-manage-orientation", {
            isOriented: false,
            userId,
          });
        }
      }
    }
  );
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

function getRegisterField(
  ctx: AuthHookContext,
  bodyKey: "registerEventId" | "registerEventSig",
  header: string
): string | undefined {
  const fromBody =
    typeof ctx.body?.[bodyKey] === "string" ? ctx.body[bodyKey] : undefined;
  return (
    fromBody ??
    getHeaderValue(ctx.headers, header) ??
    getHeaderValue(ctx.request?.headers, header)
  )?.trim();
}

/** The event of a signed sign-up link; a bare public event ID never enrolls. */
function getRegisterEventId(ctx: AuthHookContext): string | undefined {
  const eventId = getRegisterField(
    ctx,
    "registerEventId",
    "x-register-event-id"
  );
  const sig = getRegisterField(ctx, "registerEventSig", "x-register-event-sig");
  if (
    !(
      eventId &&
      sig &&
      verifyEventSignupLink(env.EVENT_SIGNUP_LINK_SECRET, eventId, sig)
    )
  ) {
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

/** Hard-bounced addresses can't receive mail; log and skip instead of sending. */
export async function skipBouncedAuthEmail(
  email: string,
  kind: "reset-password" | "verification"
): Promise<boolean> {
  if (!(await isAuthEmailBlocked(email))) {
    return false;
  }
  const log = createRequestLogger({ method: "POST", path: "sendAuthEmail" });
  log.set({ kind });
  log.warn("auth_email_suppressed_hard_bounce");
  log.emit();
  return true;
}

const turnstileSecretKey = env.TURNSTILE_SECRET_KEY;

/**
 * Client registration is open (assistants.md), and the OAuth provider fetches
 * a client's `backchannel_logout_uri` and `jwks_uri` with only syntactic host
 * checks, so a hostname resolving to a private address would reach internal
 * services. Assistants use neither.
 */
function rejectClientCallbackUrls(ctx: AuthHookContext): void {
  if (ctx.path !== "/oauth2/register") {
    return;
  }
  const body = ctx.body as Record<string, unknown> | undefined;
  for (const field of ["backchannel_logout_uri", "jwks_uri"]) {
    if (body?.[field] !== undefined) {
      throw new APIError("BAD_REQUEST", {
        error: "invalid_client_metadata",
        error_description: `${field} is not supported`,
      });
    }
  }
}

/** The page a verification email links to; it verifies on a button press. */
export function verifyEmailPageUrl(token: string, redirect?: string): string {
  return `${env.BETTER_AUTH_URL}/verify-email?token=${token}${
    redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""
  }`;
}

/** The MCP endpoint's URL: the audience of every access token it accepts. */
export const MCP_RESOURCE = `${env.BETTER_AUTH_URL}/api/mcp`;

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
  disabledPaths: [
    // The JWT plugin's session-to-JWT endpoint; OAuth clients use /oauth2/token.
    "/token",
    // Verifying goes through the verify page's POST server function, so a
    // link can't sign a visitor into someone else's account.
    "/verify-email",
    // Email OTP is only the code in an assistant's sign-up email, issued and
    // checked server-side by the MCP tools (assistants.md).
    "/email-otp/send-verification-otp",
    "/email-otp/check-verification-otp",
    "/email-otp/verify-email",
    "/sign-in/email-otp",
    "/email-otp/request-password-reset",
    "/forget-password/email-otp",
    "/email-otp/reset-password",
    "/email-otp/request-email-change",
    "/email-otp/change-email",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { ...schema, ...oauthSchema },
  }),
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          assertSuppliedAvatarImage(user.image, {
            keyPrefix: env.R2_KEY_PREFIX,
          });
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
        before: async (user, context) => {
          assertSuppliedAvatarImage(user.image, {
            keyPrefix: env.R2_KEY_PREFIX,
            userId:
              context?.path === "/admin/update-user"
                ? context.body?.userId
                : context?.context.session?.user.id,
          });
        },
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
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      if (await skipBouncedAuthEmail(user.email, "reset-password")) {
        return;
      }
      await sendResetPasswordEmail(user.email, url);
    },
  },
  emailVerification: {
    // The link proves the inbox, so it signs the account in; an assistant's
    // sign-up has no password to sign in with otherwise.
    autoSignInAfterVerification: true,
    sendOnSignIn: true,
    sendVerificationEmail: async (data, request) => {
      // Website sign-ups carry the event page (and interest marker) through
      // Better Auth's callbackURL, or the login form's header when sign-in
      // re-sends the email; the verify page files the interest.
      const url = verifyEmailPageUrl(
        data.token,
        getVerificationEventRedirect(data.url, request)
      );
      if (await skipBouncedAuthEmail(data.user.email, "verification")) {
        return;
      }
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
      rejectClientCallbackUrls(ctx);
      sanitizeSignUpBody(ctx);
      assertSignUpAgeEligible(ctx);
      stripRegistrationGroupFromUpdate(ctx);
    }),
  },
  plugins: [
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
    // One instance per endpoint so each checks its own action. The token must
    // come from the dashboard's own hostname, so a token minted elsewhere fails.
    ...(turnstileSecretKey
      ? Object.entries(TURNSTILE_ACTIONS).map(([endpoint, action]) =>
          captcha({
            allowedHostnames: [new URL(env.CORS_ORIGIN).hostname],
            endpoints: [endpoint],
            expectedAction: action,
            provider: "cloudflare-turnstile",
            secretKey: turnstileSecretKey,
          })
        )
      : []),
    // Signs the access tokens assistants get when someone connects their
    // account (assistants.md).
    jwt(),
    // OAuth for MCP clients. ChatGPT and Claude register themselves (DCR).
    mcp({
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
      // Clients come only from registration; no one manages them by hand.
      clientPrivileges: () => false,
      consentPage: "/oauth/consent",
      loginPage: "/login",
      resource: MCP_RESOURCE,
    }),
    emailOTP({
      // As long as the link it goes out with.
      expiresIn: 60 * 60,
      // Codes are only created server-side, never sent by the plugin.
      sendVerificationOTP: async () => undefined,
      storeOTP: "hashed",
    }),
    // Must stay last so it forwards cookies set by earlier plugins' after-hooks.
    tanstackStartCookies(),
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
