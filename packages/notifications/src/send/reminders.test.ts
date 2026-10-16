import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloud: { enabled: false },
  sendBulkMessage: vi.fn((_options: Record<string, unknown>) =>
    Promise.resolve()
  ),
  sendMessage: vi.fn((_options: Record<string, unknown>) => Promise.resolve()),
}));

vi.mock("@pi-dash/email", () => ({
  renderNotificationEmail: vi.fn(async () => "<html />"),
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { APP_URL: "https://dash.example.test" },
}));
vi.mock("@pi-dash/whatsapp/cloud", () => ({
  isCloudApiEnabled: () => mocks.cloud.enabled,
}));
vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: vi.fn(),
}));
vi.mock("../send-message", () => ({
  sendBulkMessage: mocks.sendBulkMessage,
  sendMessage: mocks.sendMessage,
}));

import {
  notifyEventReminder,
  notifyR2CleanupResults,
  notifyWhatsAppScanResults,
} from "./reminders";

const scan = () =>
  notifyWhatsAppScanResults({
    deactivatedUsers: [{ name: "Asha", phone: "919999999999" }],
    reactivatedUsers: [],
    scannedGroups: ["Volunteers"],
    unregisteredByGroup: [],
    userIds: ["admin-1"],
  });

const r2 = () =>
  notifyR2CleanupResults({
    deletedKeys: ["a.jpg"],
    failedKeys: [],
    orphanCount: 1,
    r2ObjectCount: 10,
    userIds: ["admin-1"],
  });

describe("ops reports on WhatsApp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["WhatsApp scan", scan],
    ["R2 cleanup", r2],
  ])("sends the %s report on WhatsApp through GoWA", async (_name, send) => {
    mocks.cloud.enabled = false;
    await send();
    expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
      skipWhatsApp: false,
      whatsappTemplate: null,
    });
  });

  it.each([
    ["WhatsApp scan", scan],
    ["R2 cleanup", r2],
  ])(
    "skips WhatsApp for the %s report on the Cloud API",
    async (_name, send) => {
      mocks.cloud.enabled = true;
      await send();
      expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
        skipWhatsApp: true,
        whatsappTemplate: null,
      });
    }
  );
});

describe("notifyEventReminder", () => {
  it("fills the template details like the other event messages", async () => {
    await notifyEventReminder({
      eventId: "event-1",
      eventName: "Beach cleanup",
      intervalMinutes: 60,
      location: "Cubbon Park",
      startTime: Date.UTC(2026, 9, 18, 12, 30),
      userId: "user-1",
    });
    expect(mocks.sendMessage.mock.calls[0]?.[0]).toMatchObject({
      whatsappTemplate: {
        name: "event_reminder",
        params: { details: "on Sun, 18 Oct, 6:00 pm at Cubbon Park" },
      },
    });
  });
});
