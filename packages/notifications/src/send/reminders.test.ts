import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
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
  isCloudApiEnabled: () => false,
}));
vi.mock("@pi-dash/whatsapp/gowa-log", () => ({ logGowaSend: vi.fn() }));
vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: vi.fn(),
}));
vi.mock("../send-message", () => ({
  sendBulkMessage: mocks.sendBulkMessage,
  sendMessage: mocks.sendMessage,
}));

import { notifyEventReminder } from "./reminders";

describe("notifyEventReminder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses one stable idempotency key per recurring occurrence", async () => {
    const send = (instanceDate: string) =>
      notifyEventReminder({
        eventId: "series-1",
        eventName: "Weekly cleanup",
        instanceDate,
        intervalMinutes: 60,
        location: null,
        startTime: Date.UTC(2026, 9, 18, 12, 30),
        userId: "user-1",
      });

    await send("2026-10-18");
    await send("2026-10-25");
    await send("2026-10-18");

    expect(
      mocks.sendMessage.mock.calls.map(([options]) => options.idempotencyKey)
    ).toEqual([
      "event-reminder-series-1-2026-10-18-60-user-1",
      "event-reminder-series-1-2026-10-25-60-user-1",
      "event-reminder-series-1-2026-10-18-60-user-1",
    ]);
  });
});
