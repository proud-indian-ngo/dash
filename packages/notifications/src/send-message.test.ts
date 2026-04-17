import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./kill-switch", () => ({
  isNotificationsDisabled: vi.fn(async () => true),
}));

vi.mock("./client", () => ({
  courier: undefined,
}));

vi.mock("./preferences", () => ({
  getCourierTopicId: vi.fn(async (t: string) => t),
}));

vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppMessage: vi.fn(async () => undefined),
}));

vi.mock("@pi-dash/whatsapp/preferences", () => ({
  getEnabledUserPhonesForTopic: vi.fn(async () => new Map()),
  isWhatsAppTopicEnabled: vi.fn(async () => false),
}));

vi.mock("@pi-dash/whatsapp/users", () => ({
  getUserPhone: vi.fn(async () => null),
}));

vi.mock("@pi-dash/env/server", () => ({
  env: { APP_URL: "http://test", APP_NAME: "test" },
}));

import { captureSends, sendBulkMessage, sendMessage } from "./send-message";
import { TOPICS } from "./topics";

const baseMessage = {
  to: "user-1",
  title: "t",
  body: "b",
  idempotencyKey: "k",
  topic: TOPICS.ACCOUNT,
};

describe("captureSends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("captures a single sendMessage call inside the scope", async () => {
    const { result, sends } = await captureSends(() =>
      sendMessage(baseMessage)
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.kind).toBe("message");
    expect(result.suppressedByKillSwitch).toBe(true);
  });

  it("captures parallel sends without cross-contamination", async () => {
    const runA = captureSends(() =>
      Promise.all([
        sendMessage({ ...baseMessage, to: "a1" }),
        sendMessage({ ...baseMessage, to: "a2" }),
      ])
    );
    const runB = captureSends(() => sendMessage({ ...baseMessage, to: "b1" }));
    const [a, b] = await Promise.all([runA, runB]);
    expect(a.sends).toHaveLength(2);
    expect(b.sends).toHaveLength(1);
    const aTos = a.sends.map((s) =>
      s.kind === "message" ? s.result.to : null
    );
    expect(aTos).toEqual(["a1", "a2"]);
  });

  it("captures sends emitted before a thrown error", async () => {
    const run = captureSends(async () => {
      await sendMessage({ ...baseMessage, to: "before" });
      throw new Error("boom");
    });
    await expect(run).rejects.toThrow("boom");
  });

  it("records sendBulkMessage with bulk kind", async () => {
    const { sends } = await captureSends(() =>
      sendBulkMessage({
        userIds: ["u1", "u2"],
        title: "t",
        body: "b",
        idempotencyKey: "k",
        topic: TOPICS.ACCOUNT,
      })
    );
    expect(sends).toHaveLength(1);
    expect(sends[0]?.kind).toBe("bulk");
  });

  it("isolates nested captureSends scopes", async () => {
    const { sends: outer } = await captureSends(async () => {
      await sendMessage({ ...baseMessage, to: "outer" });
      const { sends: inner } = await captureSends(() =>
        sendMessage({ ...baseMessage, to: "inner" })
      );
      expect(inner).toHaveLength(1);
    });
    // AsyncLocalStorage.run replaces the active store for the inner scope,
    // so the inner send is not recorded in the outer store.
    expect(outer).toHaveLength(1);
    expect(outer[0]?.kind === "message" && outer[0].result.to).toBe("outer");
  });
});
