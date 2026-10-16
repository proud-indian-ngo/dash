import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudEnabled: true,
  deleted: 0,
  inserted: [] as unknown[],
  insertReturns: [{ key: "k" }] as unknown[],
  sendCloudTemplate: vi.fn(async () => "wamid.1"),
  sendWhatsAppMessage: vi.fn(async () => undefined),
  updates: [] as unknown[],
}));

vi.mock("@pi-dash/db", () => {
  const chain = (result: () => unknown, onSet?: (v: unknown) => void) =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) => resolve(result());
          }
          return (arg: unknown) => {
            if (prop === "set") {
              onSet?.(arg);
            }
            if (prop === "values") {
              mocks.inserted.push(arg);
            }
            return chain(result, onSet);
          };
        },
      }
    );
  return {
    db: {
      delete: () =>
        chain(() => {
          mocks.deleted += 1;
          return [];
        }),
      insert: () => chain(() => mocks.insertReturns),
      update: () =>
        chain(
          () => [],
          (v) => mocks.updates.push(v)
        ),
    },
  };
});
vi.mock("./cloud", () => {
  class CloudApiError extends Error {
    readonly code: number | undefined;
    readonly status: number;
    constructor(message: string, status: number, code?: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  }
  return {
    CloudApiError,
    isCloudApiEnabled: () => mocks.cloudEnabled,
    isTransientCloudError: (error: unknown) =>
      !(error instanceof CloudApiError) || error.status >= 500,
    sendCloudTemplate: mocks.sendCloudTemplate,
    sendCloudText: vi.fn(),
  };
});
vi.mock("./messaging", () => ({
  sendWhatsAppMessage: mocks.sendWhatsAppMessage,
}));

import { CloudApiError } from "./cloud";
import { sendWhatsAppNotification, statusesBefore } from "./notify";
import { whatsappTemplate } from "./template-message";

const template = whatsappTemplate(
  "team_added",
  { team: "Sunday" },
  "/teams/t1"
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cloudEnabled = true;
  mocks.deleted = 0;
  mocks.inserted = [];
  mocks.insertReturns = [{ key: "k" }];
  mocks.updates = [];
});

describe("sendWhatsAppNotification", () => {
  it("sends the template through Meta and records the message ID", async () => {
    const outcome = await sendWhatsAppNotification(
      "+91 98765 43210",
      { template, text: "fallback" },
      { idempotencyKey: "k", userId: "u1" }
    );
    expect(outcome).toBe("sent");
    expect(mocks.sendCloudTemplate).toHaveBeenCalledWith(
      "+91 98765 43210",
      template
    );
    expect(mocks.inserted).toEqual([
      { idempotencyKey: "k", template: "team_added", userId: "u1" },
    ]);
    expect(mocks.updates).toEqual([{ status: "sent", wamid: "wamid.1" }]);
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("skips a send whose key was already claimed", async () => {
    mocks.insertReturns = [];
    const outcome = await sendWhatsAppNotification(
      "919876543210",
      { template, text: "fallback" },
      { idempotencyKey: "k" }
    );
    expect(outcome).toBe("duplicate");
    expect(mocks.sendCloudTemplate).not.toHaveBeenCalled();
  });

  it("frees the key and throws on a transient failure, so the job retries", async () => {
    mocks.sendCloudTemplate.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      sendWhatsAppNotification(
        "919876543210",
        { template, text: "fallback" },
        { idempotencyKey: "k" }
      )
    ).rejects.toThrow("timeout");
    expect(mocks.deleted).toBe(1);
  });

  it("keeps a permanent rejection as failed and doesn't throw", async () => {
    mocks.sendCloudTemplate.mockRejectedValueOnce(
      new CloudApiError("Template name does not exist", 404, 132_001)
    );
    const outcome = await sendWhatsAppNotification(
      "919876543210",
      { template, text: "fallback" },
      { idempotencyKey: "k" }
    );
    expect(outcome).toBe("rejected");
    expect(mocks.deleted).toBe(0);
    expect(mocks.updates).toEqual([
      { error: "132001 Template name does not exist", status: "failed" },
    ]);
  });

  it("doesn't fall back to the gateway for a message without a template", async () => {
    const outcome = await sendWhatsAppNotification(
      "919876543210",
      { text: "fallback" },
      { idempotencyKey: "k" }
    );
    expect(outcome).toBe("no_template");
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
    expect(mocks.sendCloudTemplate).not.toHaveBeenCalled();
  });

  it("sends the text through GoWA while the Cloud API isn't configured", async () => {
    mocks.cloudEnabled = false;
    await sendWhatsAppNotification(
      "919876543210",
      { template, text: "fallback" },
      { idempotencyKey: "k" }
    );
    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledWith(
      "919876543210",
      "fallback",
      { idempotencyKey: "k" }
    );
    expect(mocks.sendCloudTemplate).not.toHaveBeenCalled();
  });
});

describe("statusesBefore", () => {
  it("only moves a status forward, and failed wins", () => {
    expect(statusesBefore("sent")).toEqual(["sending"]);
    expect(statusesBefore("delivered")).toEqual(["sending", "sent"]);
    expect(statusesBefore("read")).toEqual(["sending", "sent", "delivered"]);
    expect(statusesBefore("failed")).toEqual([
      "sending",
      "sent",
      "delivered",
      "read",
    ]);
  });
});
