import { beforeEach, describe, expect, it, mock } from "bun:test";

let granted: string[] = [];
let audits: { action: string; metadata?: unknown; target?: unknown }[] = [];
let serviceCalls: string[] = [];

const deny = (permission: string) => {
  if (!granted.includes(permission)) {
    throw new Error("Forbidden");
  }
};

mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("@/lib/api-auth", () => ({
  assertServerPermission: async (_s: unknown, permission: string) =>
    deny(permission),
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    options: { action: string; metadata?: unknown; target?: unknown },
    execute: () => Promise<unknown>
  ) => {
    audits.push(options);
    return await execute();
  },
}));
mock.module("@/lib/razorpay/settings", () => ({
  getRazorpaySettingsView: async () => {
    serviceCalls.push("view");
    return { configured: true };
  },
  saveRazorpaySettings: async () => {
    serviceCalls.push("save");
    return { attachedBatchCount: 2 };
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

const fns = await import("./razorpay-settings");
type Handler = (input: {
  context: { headers?: Headers; session: unknown };
  data?: unknown;
}) => Promise<unknown>;
const call = (fn: unknown, data?: unknown) =>
  (fn as Handler)({ context: { session: { user: { id: "u-1" } } }, data });

const SAVE = {
  clearingAccountId: "0190a000-0000-7000-8000-000000000001",
  notesKeys: {},
};

describe("Razorpay settings server functions", () => {
  beforeEach(() => {
    granted = [];
    audits = [];
    serviceCalls = [];
  });

  it("needs finance.view to read and does nothing when denied", async () => {
    granted = ["donors.manage"];
    await expect(call(fns.getRazorpaySettings)).rejects.toThrow("Forbidden");
    expect(serviceCalls).toEqual([]);
    granted = ["finance.view"];
    expect(await call(fns.getRazorpaySettings)).toEqual({ configured: true });
    // A read: never audited.
    expect(audits).toEqual([]);
  });

  it("needs finance.manage to save, so finance.view alone cannot", async () => {
    granted = ["finance.view", "donors.manage"];
    await expect(call(fns.updateRazorpaySettings, SAVE)).rejects.toThrow(
      "Forbidden"
    );
    expect(serviceCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("audits a save with field names only", async () => {
    granted = ["finance.manage"];
    expect(await call(fns.updateRazorpaySettings, SAVE)).toEqual({
      attachedBatchCount: 2,
    });
    expect(serviceCalls).toEqual(["save"]);
    expect(audits).toEqual([
      {
        action: "razorpay_settings.update",
        metadata: { changedFields: ["clearingAccountId", "notesKeys"] },
        target: { type: "razorpay_settings" },
      },
    ]);
  });
});
