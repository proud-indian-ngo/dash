import { beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";

import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";

// Failure cases: sibling-origin text/plain writes; misleading Fetch Metadata;
// null, malformed or forged origins; a Zero path bypass; blocked legitimate
// browser requests or headerless callbacks; changed Better Auth CSRF behavior.
const origin = "https://dash.example.test";
const syntheticAuth = betterAuth({
  baseURL: origin,
  secret: "synthetic-csrf-test-key-with-over-32-characters",
  database: memoryAdapter({
    user: [],
    session: [],
    account: [],
    verification: [],
  }),
  emailAndPassword: { enabled: true },
  trustedOrigins: [origin],
  advanced: { disableOriginCheck: false },
  user: {
    additionalFields: {
      role: { type: "string", defaultValue: "super_admin", input: false },
    },
  },
  rateLimit: { enabled: false },
  telemetry: { enabled: false },
  logger: { disabled: true },
});
const enqueue = mock(async () => "csrf-test-job");
const retry = mock(async () => undefined);
const cancel = mock(async () => undefined);
const execute = mock(async () => [{ name: "synthetic-job", state: "failed" }]);
mock.module("@pi-dash/auth", () => ({ auth: syntheticAuth }));
mock.module("@pi-dash/env/server", () => ({ env: { CORS_ORIGIN: origin } }));
mock.module("@pi-dash/db", () => ({ db: { execute } }));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions: async () => ["jobs.manage"],
}));
mock.module("@pi-dash/jobs/enqueue", () => ({
  enqueue,
  QUEUE_NAMES: ["synthetic-job"],
}));
mock.module("@pi-dash/jobs/boss-instance", () => ({
  ensureBossReady: async () => ({ retry, cancel }),
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ set() {}, error() {}, emit() {} }),
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    _options: unknown,
    run: () => unknown
  ) => await run(),
  classifyAuditResponse() {},
}));

const { requireSession } = await import("./api-auth");
const { Route: jobs } = await import("../routes/api/jobs/index");
const { Route: retryRoute } = await import("../routes/api/jobs/$id/retry");
const { Route: cancelRoute } = await import("../routes/api/jobs/$id/cancel");
let cookie: string;
beforeAll(async () => {
  const response = await syntheticAuth.api.signUpEmail({
    body: {
      name: "CSRF test",
      email: "csrf@example.test",
      password: "Synthetic-test-password-123!",
    },
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.includes("session_token="));
  expect(sessionCookie).toMatch(/HttpOnly/);
  expect(sessionCookie).toMatch(/Secure/);
  expect(sessionCookie).toMatch(/SameSite=Lax/i);
  cookie = sessionCookie!.split(";")[0]!;
});
beforeEach(() => mock.clearAllMocks());

function request(
  headers: HeadersInit = {},
  path = "/api/jobs",
  method = "POST"
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: { cookie, ...Object.fromEntries(new Headers(headers)) },
    ...(method === "GET"
      ? {}
      : { body: JSON.stringify({ queue: "synthetic-job", data: {} }) }),
  });
}
type Post = (input: {
  request: Request;
  params: { id: string };
}) => Promise<Response>;
function post(route: unknown, input: Request) {
  return (
    route as { options: { server: { handlers: { POST: Post } } } }
  ).options.server.handlers.POST({
    request: input,
    params: { id: "019f0000-0090-7000-8000-000000000001" },
  });
}
const deniedHeaders: HeadersInit[] = [
  {
    origin: "https://evil.example.test",
    "sec-fetch-site": "same-site",
    "content-type": "text/plain",
  },
  { origin: "https://foreign.test", "sec-fetch-site": "cross-site" },
  { origin: "https://evil.example.test" },
  { origin, "sec-fetch-site": "same-site" },
  { origin, "sec-fetch-site": "cross-site" },
  { origin, "sec-fetch-site": "none" },
  { origin, "sec-fetch-site": "invalid" },
  { origin, "sec-fetch-site": "" },
  { origin: "null", "sec-fetch-site": "same-origin" },
  { origin: `${origin}/untrusted-path` },
  { origin: `${origin}.evil.test` },
  { referer: "https://evil.example.test/form" },
  { referer: "invalid" },
  { "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty" },
];
const allowedHeaders: HeadersInit[] = [
  {},
  { origin },
  {
    origin,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  },
  { "sec-fetch-site": "same-origin" },
  { referer: `${origin}/jobs` },
];

describe("cookie-authenticated write requests", () => {
  it.each(deniedHeaders)(
    "rejects untrusted browser headers %j on every protected path",
    async (headers) => {
      for (const path of ["/api/jobs", "/api/zero/query", "/api/zero/mutate"]) {
        const result = await requireSession(request(headers, path));
        expect(result.error?.status).toBe(403);
        expect(result.session).toBeUndefined();
      }
    }
  );

  it.each([jobs, retryRoute, cancelRoute])(
    "refuses sibling-origin raw job writes before side effects",
    async (route) => {
      const response = await post(route, request(deniedHeaders[0]));
      expect(response.status).toBe(403);
      expect(enqueue).not.toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    }
  );

  it.each(allowedHeaders)(
    "preserves trusted browser and non-browser sessions %j",
    async (headers) => {
      for (const path of ["/api/jobs", "/api/zero/query", "/api/zero/mutate"]) {
        const result = await requireSession(request(headers, path));
        expect(result.error).toBeUndefined();
        expect(result.session?.user.email).toBe("csrf@example.test");
      }
      expect((await post(jobs, request(headers))).status).toBe(201);
      expect(enqueue).toHaveBeenCalledTimes(1);
    }
  );

  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "protects %s independently of the content type",
    async (method) => {
      expect(
        (await requireSession(request(deniedHeaders[0], "/api/jobs", method)))
          .error?.status
      ).toBe(403);
    }
  );

  it("uses configured origin rather than forwarded or request hosts", async () => {
    const result = await requireSession(
      new Request("https://evil.example.test/api/jobs", {
        method: "POST",
        headers: {
          cookie,
          origin: "https://evil.example.test",
          "x-forwarded-host": "evil.example.test",
          "sec-fetch-site": "same-origin",
        },
      })
    );
    expect(result.error?.status).toBe(403);
  });

  it("preserves safe reads and still authenticates callbacks", async () => {
    expect(
      (await requireSession(request(deniedHeaders[0], "/api/jobs", "GET")))
        .session
    ).toBeDefined();
    expect(
      (
        await requireSession(
          new Request(`${origin}/api/zero/query`, { method: "POST" })
        )
      ).error?.status
    ).toBe(401);
  });

  it("leaves Better Auth's own CSRF protection active", async () => {
    const response = await syntheticAuth.handler(
      new Request(`${origin}/api/auth/update-user`, {
        method: "POST",
        headers: {
          cookie,
          origin: "https://evil.example.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "forged" }),
      })
    );
    expect(response.status).toBe(403);
    expect(
      (await syntheticAuth.api.getSession({ headers: new Headers({ cookie }) }))
        ?.user.name
    ).toBe("CSRF test");
  });
});
