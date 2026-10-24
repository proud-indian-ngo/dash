import { describe, expect, it, mock } from "bun:test";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

// Failure cases: either reset leaves old cookies usable, new-password sign-in
// breaks, or admin reset revokes the actor's sessions instead of the target's.
// Exercise Better Auth's real credential/session APIs with its memory adapter;
// only persistence, transport, audit storage and external side effects are fake.
mock.module("@pi-dash/env/server", () => ({
  env: {
    BETTER_AUTH_URL: "http://localhost:3001",
    CORS_ORIGIN: "http://localhost:3001",
  },
}));
mock.module("@pi-dash/db", () => ({
  db: {
    select: () => {
      const query = {
        from: () => query,
        limit: async () => [{ id: "target", role: "volunteer" }],
        where: () => query,
      };
      return query;
    },
  },
}));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  invalidatePermissionCache: () => {},
  resolvePermissions: async () => ["users.set_password"],
}));
mock.module("@pi-dash/jobs/enqueue", () => ({ enqueue: async () => {} }));
mock.module("@pi-dash/email", () => ({
  sendResetPasswordEmail: async () => {},
  sendVerificationEmail: async () => {},
}));
mock.module("@pi-dash/observability", () => ({
  withFireAndForgetLog: () => {},
}));
mock.module("@pi-dash/notifications/send/user", () => ({
  prepareUserDeletedEmail: async () => {},
  sendUserDeletedEmail: async () => {},
}));
mock.module("@pi-dash/whatsapp/groups", () => ({
  getAllGroupJidsForUser: async () => [],
}));
mock.module("@pi-dash/whatsapp/users", () => ({
  getUserPhone: async () => null,
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      handler: (handler: unknown) => handler,
      middleware: () => builder,
      validator: () => builder,
    };
    return builder;
  },
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: (
    _session: unknown,
    _headers: unknown,
    _audit: unknown,
    action: () => Promise<unknown>
  ) => action(),
}));

const { auth: configuredAuth } =
  await import("../../../../packages/auth/src/auth");
let resetToken = "";
const auth = betterAuth({
  ...configuredAuth.options,
  database: memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  }),
  databaseHooks: undefined,
  emailAndPassword: {
    ...configuredAuth.options.emailAndPassword,
    enabled: true,
    sendResetPassword: async ({ token }) => {
      resetToken = token;
    },
  },
  emailVerification: undefined,
  hooks: undefined,
  plugins: configuredAuth.options.plugins.filter(
    (plugin) => plugin.id === "admin"
  ),
  secret: "password-reset-regression-test-secret-only",
});
mock.module("@pi-dash/auth", () => ({ auth }));
const { setUserPasswordAdmin } = await import("./user-admin");

const oldPassword = "old-password-123";
const newPassword = "new-password-456";

async function signIn(email: string, password: string) {
  const response = await auth.api.signInEmail({
    asResponse: true,
    body: { email, password },
  });
  expect(response.status).toBe(200);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  expect(cookie).toContain("session_token=");
  return new Headers({ cookie });
}

async function createUser(role: "volunteer" | "admin") {
  const email = `${crypto.randomUUID()}@example.test`;
  const { user } = await auth.api.createUser({
    body: {
      data: { emailVerified: true },
      email,
      name: "Password Regression",
      password: oldPassword,
      role,
    },
  });
  return { email, id: user.id };
}

describe("password reset session containment", () => {
  it("email recovery rejects every old session and accepts the new password", async () => {
    const target = await createUser("volunteer");
    const oldHeaders = [
      await signIn(target.email, oldPassword),
      await signIn(target.email, oldPassword),
    ];
    for (const headers of oldHeaders) {
      expect(await auth.api.getSession({ headers })).not.toBeNull();
    }
    await auth.api.requestPasswordReset({ body: { email: target.email } });
    expect(resetToken).not.toBe("");
    await auth.api.resetPassword({ body: { newPassword, token: resetToken } });

    for (const headers of oldHeaders) {
      expect(await auth.api.getSession({ headers })).toBeNull();
    }
    const headers = await signIn(target.email, newPassword);
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(target.id);
  });

  it("admin reset rejects target sessions, preserves the actor and accepts the new password", async () => {
    const actor = await createUser("admin");
    const target = await createUser("volunteer");
    const headers = await signIn(actor.email, oldPassword);
    const session = await auth.api.getSession({ headers });
    const oldHeaders = [
      await signIn(target.email, oldPassword),
      await signIn(target.email, oldPassword),
    ];
    for (const cookie of oldHeaders) {
      expect(await auth.api.getSession({ headers: cookie })).not.toBeNull();
    }
    const handler = setUserPasswordAdmin as unknown as (args: {
      context: { headers: Headers; session: typeof session };
      data: { newPassword: string; userId: string };
    }) => Promise<string>;
    expect(
      await handler({
        context: { headers, session },
        data: { newPassword, userId: target.id },
      })
    ).toBe(target.id);

    for (const cookie of oldHeaders) {
      expect(await auth.api.getSession({ headers: cookie })).toBeNull();
    }
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(actor.id);
    const newHeaders = await signIn(target.email, newPassword);
    expect((await auth.api.getSession({ headers: newHeaders }))?.user.id).toBe(
      target.id
    );
  });
});
