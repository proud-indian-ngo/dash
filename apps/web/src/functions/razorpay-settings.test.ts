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
class RazorpaySettingsError extends Error {}
let saveError: unknown = null;

mock.module("@/lib/razorpay/settings", () => ({
  RazorpaySettingsError,
  getRazorpaySettingsView: async () => {
    serviceCalls.push("view");
    return { configured: true };
  },
  saveRazorpaySettings: async () => {
    serviceCalls.push("save");
    if (saveError) {
      throw saveError;
    }
    return { attachedBatchCount: 2, requeuedCount: 1 };
  },
  requestRazorpayReconcile: async (request: {
    from?: string;
    reason: string;
    to?: string;
  }) => {
    serviceCalls.push(`reconcile:${request.reason}`);
    if (saveError) {
      throw saveError;
    }
    return request.reason === "backfill"
      ? { days: 3, from: request.from, to: request.to }
      : { days: 4, from: "2026-10-11", to: "2026-10-14" };
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
    saveError = null;
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
      requeuedCount: 1,
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

  it("audits a save of the notes keys alone as that field only", async () => {
    granted = ["finance.manage"];
    await call(fns.updateRazorpaySettings, { notesKeys: {} });
    expect(audits[0]?.metadata).toEqual({ changedFields: ["notesKeys"] });
  });

  it("replaces a query error with a generic one and keeps setting errors", async () => {
    granted = ["finance.manage"];
    saveError = Object.assign(
      new Error('Failed query: update "app_config" params: secret-ish'),
      { code: "23505" }
    );
    const error = await call(fns.updateRazorpaySettings, SAVE).then(
      () => null,
      (e: unknown) => e as Error
    );
    expect(error?.message).toBe("Razorpay settings couldn't be saved.");
    expect(error?.cause).toBeUndefined();

    saveError = new RazorpaySettingsError("Choose an active clearing account");
    await expect(call(fns.updateRazorpaySettings, SAVE)).rejects.toThrow(
      "Choose an active clearing account"
    );
  });

  it("needs finance.manage to sync now or import past payments", async () => {
    granted = ["finance.view", "donors.manage"];
    await expect(call(fns.syncRazorpayNow)).rejects.toThrow("Forbidden");
    await expect(
      call(fns.importPastRazorpayPayments, {
        from: "2026-04-01",
        to: "2026-04-03",
      })
    ).rejects.toThrow("Forbidden");
    expect(serviceCalls).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("audits Sync now with no payload and returns the window", async () => {
    granted = ["finance.manage"];
    expect(await call(fns.syncRazorpayNow)).toEqual({
      days: 4,
      from: "2026-10-11",
      to: "2026-10-14",
    });
    expect(serviceCalls).toEqual(["reconcile:manual"]);
    expect(audits).toEqual([
      { action: "razorpay.sync", target: { type: "razorpay_settings" } },
    ]);
  });

  it("audits an import of past payments with the window's dates only", async () => {
    granted = ["finance.manage"];
    expect(
      await call(fns.importPastRazorpayPayments, {
        from: "2026-04-01",
        to: "2026-04-03",
      })
    ).toEqual({ days: 3, from: "2026-04-01", to: "2026-04-03" });
    expect(serviceCalls).toEqual(["reconcile:backfill"]);
    expect(audits).toEqual([
      {
        action: "razorpay.backfill",
        metadata: { from: "2026-04-01", to: "2026-04-03" },
        target: { type: "razorpay_settings" },
      },
    ]);
  });

  it("keeps a refusal's message and hides a query error's", async () => {
    granted = ["finance.manage"];
    saveError = new RazorpaySettingsError(
      "A Razorpay sync is already running."
    );
    await expect(call(fns.syncRazorpayNow)).rejects.toThrow(
      "A Razorpay sync is already running."
    );
    saveError = Object.assign(new Error("Failed query: insert pgboss"), {
      code: "57014",
    });
    const error = await call(fns.syncRazorpayNow).then(
      () => null,
      (e: unknown) => e as Error
    );
    expect(error?.message).toBe("The Razorpay sync couldn't be started.");
  });
});
