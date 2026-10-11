import { beforeEach, describe, expect, it, mock } from "bun:test";
import { createHash } from "node:crypto";

let allowed = true;
let permissionChecks: string[] = [];
let created: { name: string; scopes: string[]; tokenHash: string }[] = [];
let revokeResult = true;
let revokedIds: string[] = [];
let audits: {
  action: string;
  metadata?: Record<string, unknown>;
  successTarget?: unknown;
  target?: unknown;
}[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async (_session: unknown, permission: string) => {
    permissionChecks.push(permission);
    if (!allowed) {
      throw new Error("Forbidden");
    }
  },
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: {
      action: string;
      metadata?: Record<string, unknown>;
      target?: unknown;
    },
    execute: () => Promise<unknown>,
    _classify?: unknown,
    resolveSuccessTarget?: (result: unknown) => unknown
  ) => {
    const entry: (typeof audits)[number] = { ...options };
    audits.push(entry);
    const result = await execute();
    entry.successTarget = resolveSuccessTarget?.(result);
    return result;
  },
}));
mock.module("@pi-dash/db/queries/social-api-token", () => ({
  findActiveSocialApiToken: async () => null,
  touchSocialApiToken: async () => undefined,
  createSocialApiToken: async (input: (typeof created)[number]) => {
    created.push(input);
    return "0190a000-0000-7000-8000-000000000001";
  },
  listSocialApiTokens: async () => [
    {
      createdAt: new Date(1000),
      id: "token-1",
      lastUsedAt: null,
      name: "worker",
      revokedAt: new Date(2000),
      scopes: ["events:read"],
    },
  ],
  revokeSocialApiToken: async (id: string) => {
    revokedIds.push(id);
    return revokeResult;
  },
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

const { createSocialApiTokenFn, getSocialApiTokens, revokeSocialApiTokenFn } =
  await import("./social-api-tokens");

const session = { user: { id: "admin-1", role: "admin" } };
type Handler = (input: unknown) => Promise<unknown>;
const call = (fn: unknown, data?: unknown) =>
  (fn as Handler)({ context: { headers: new Headers(), session }, data });

describe("social API token server functions", () => {
  beforeEach(() => {
    allowed = true;
    permissionChecks = [];
    created = [];
    revokeResult = true;
    revokedIds = [];
    audits = [];
  });

  it("lists tokens with epoch dates behind settings.app_config", async () => {
    expect(await call(getSocialApiTokens)).toEqual([
      {
        createdAt: 1000,
        id: "token-1",
        lastUsedAt: null,
        name: "worker",
        revokedAt: 2000,
        scopes: ["events:read"],
      },
    ]);
    expect(permissionChecks).toEqual(["settings.app_config"]);
  });

  it("refuses to list without permission", async () => {
    allowed = false;
    await expect(call(getSocialApiTokens)).rejects.toThrow("Forbidden");
  });

  it("creates a token, stores only its sha256 and audits without secrets", async () => {
    const result = (await call(createSocialApiTokenFn, {
      name: "worker",
      scopes: ["events:read", "social:write"],
    })) as { id: string; token: string };

    expect(result.token.length).toBeGreaterThanOrEqual(43);
    expect(created).toEqual([
      {
        name: "worker",
        scopes: ["events:read", "social:write"],
        tokenHash: createHash("sha256").update(result.token).digest("hex"),
      },
    ]);
    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("socialApiToken.create");
    expect(audits[0]?.successTarget).toEqual({
      id: result.id,
      type: "socialApiToken",
    });
    const audited = JSON.stringify(audits);
    expect(audited).not.toContain(result.token);
    expect(audited).not.toContain(created[0]?.tokenHash ?? "missing");
    expect(audited).not.toContain("worker");
  });

  it("checks permission inside the audited action before creating", async () => {
    allowed = false;
    await expect(
      call(createSocialApiTokenFn, { name: "x", scopes: ["events:read"] })
    ).rejects.toThrow("Forbidden");
    expect(audits.map((a) => a.action)).toEqual(["socialApiToken.create"]);
    expect(created).toHaveLength(0);
  });

  it("revokes through the audited action", async () => {
    const id = "0190a000-0000-7000-8000-000000000002";
    expect(await call(revokeSocialApiTokenFn, { id })).toEqual({
      revoked: true,
    });
    expect(revokedIds).toEqual([id]);
    expect(audits[0]).toMatchObject({
      action: "socialApiToken.revoke",
      target: { id, type: "socialApiToken" },
    });
  });

  it("fails when the token is missing or already revoked", async () => {
    revokeResult = false;
    await expect(
      call(revokeSocialApiTokenFn, {
        id: "0190a000-0000-7000-8000-000000000003",
      })
    ).rejects.toThrow("already revoked");
  });
});
