import { expect, mock, test } from "bun:test";

mock.module("@pi-dash/env/server", () => ({
  env: {
    CORS_ORIGIN: "https://dash.example.test",
    NODE_ENV: "production",
  },
}));
mock.module("nitro/h3", () => ({
  defineEventHandler: (handler: unknown) => handler,
}));

const { default: securityHeaders } =
  await import("../../server/middleware/security-headers");

test("production CSP permits Turnstile scripts and challenge frames", async () => {
  const headers = new Headers();
  await securityHeaders({ res: { headers } } as Parameters<
    typeof securityHeaders
  >[0]);
  const policy = headers.get("Content-Security-Policy");
  expect(policy).not.toBeNull();
  const directives = new Map(
    policy?.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    })
  );

  expect(directives.get("script-src")).toContain(
    "https://challenges.cloudflare.com"
  );
  expect(directives.get("frame-src")).toContain(
    "https://challenges.cloudflare.com"
  );
  expect(directives.get("frame-src")).not.toContain("*");
  expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
});
