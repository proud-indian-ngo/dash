import { beforeEach, describe, expect, it, mock } from "bun:test";

let allowed = false;
let configured = false;
let configChecks = 0;
let listCalls = 0;
let permissionChecks: string[] = [];

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async (_session: unknown, permission: string) => {
    permissionChecks.push(permission);
    if (!allowed) {
      throw new Error("Forbidden");
    }
  },
}));
mock.module("@pi-dash/whatsapp/groups", () => ({
  isWhatsAppConfigured: () => {
    configChecks++;
    return configured;
  },
  listJoinedGroups: async () => {
    listCalls++;
    return [];
  },
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({ handler: (handler: unknown) => handler }),
  }),
}));

const { checkWhatsAppConfiguration, fetchWhatsAppGroups } =
  await import("./whatsapp-groups");
const session = { user: { id: "actor", role: "admin" } };
const runCheck = () =>
  (
    checkWhatsAppConfiguration as unknown as (
      input: unknown
    ) => Promise<unknown>
  )({ context: { session } });
const runPicker = () =>
  (fetchWhatsAppGroups as unknown as (input: unknown) => Promise<unknown>)({
    context: { session },
  });

describe("WhatsApp configuration check", () => {
  beforeEach(() => {
    allowed = false;
    configured = false;
    configChecks = 0;
    listCalls = 0;
    permissionChecks = [];
  });

  it("enforces settings permission before reading configuration", async () => {
    await expect(runCheck()).rejects.toThrow("Forbidden");
    expect(permissionChecks).toEqual(["settings.whatsapp_groups"]);
    expect(configChecks).toBe(0);
    expect(listCalls).toBe(0);
  });

  it.each([true, false])(
    "returns configured=%s without requesting provider groups",
    async (value) => {
      allowed = true;
      configured = value;
      expect(await runCheck()).toEqual({ configured: value });
      expect(permissionChecks).toEqual(["settings.whatsapp_groups"]);
      expect(configChecks).toBe(1);
      expect(listCalls).toBe(0);
    }
  );

  it("keeps group listing in the picker request", async () => {
    allowed = true;
    configured = true;
    await runCheck();
    expect(listCalls).toBe(0);
    expect(await runPicker()).toEqual({ configured: true, groups: [] });
    expect(listCalls).toBe(1);
  });
});
