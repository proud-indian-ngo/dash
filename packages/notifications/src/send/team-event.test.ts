import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendBulkMessage: vi.fn((_options: Record<string, unknown>) =>
    Promise.resolve()
  ),
  sendMessage: vi.fn((_options: Record<string, unknown>) => Promise.resolve()),
}));

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/email", () => ({
  renderNotificationEmail: vi.fn(async () => "<html />"),
}));
vi.mock("@pi-dash/env/server", () => ({
  env: { APP_URL: "https://dash.example.test" },
}));
vi.mock("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: vi.fn(),
}));
vi.mock("../send-message", () => ({
  sendBulkMessage: mocks.sendBulkMessage,
  sendMessage: mocks.sendMessage,
}));

import { notifyAddedToEvent, notifyEventCancelled } from "./team-event";

describe("event WhatsApp templates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fills event_added with the date and place, without a leading space", async () => {
    await notifyAddedToEvent({
      eventId: "event-1",
      eventName: "Beach cleanup",
      location: "Cubbon Park",
      startTime: Date.UTC(2026, 9, 18, 4, 30),
      userId: "user-1",
    });

    const template = mocks.sendMessage.mock.calls[0]?.[0]?.whatsappTemplate as {
      name: string;
      params: Record<string, string>;
      path: string;
    };
    expect(template.name).toBe("event_added");
    expect(template.path).toBe("events/event-1");
    expect(template.params.event).toBe("Beach cleanup");
    expect(template.params.details).toBe(
      "on Sun, 18 Oct, 10:00 am at Cubbon Park"
    );
  });

  it("leaves out the place when the event has none", async () => {
    await notifyAddedToEvent({
      eventId: "event-1",
      eventName: "Beach cleanup",
      location: null,
      startTime: Date.UTC(2026, 9, 18, 4, 30),
      userId: "user-1",
    });

    const template = mocks.sendMessage.mock.calls[0]?.[0]?.whatsappTemplate as {
      params: Record<string, string>;
    };
    expect(template.params.details).toBe("on Sun, 18 Oct, 10:00 am");
  });

  it("fills event_cancelled with the team page path", async () => {
    await notifyEventCancelled({
      cancelledAt: 1,
      eventId: "event-1",
      eventMemberIds: ["user-1"],
      eventName: "Beach cleanup",
      teamId: "team-1",
    });

    expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
      whatsappTemplate: {
        name: "event_cancelled",
        params: { event: "Beach cleanup" },
        path: "teams/team-1",
      },
    });
  });

  it("says only the upcoming sessions are cancelled when a series ends", async () => {
    await notifyEventCancelled({
      cancelledAt: 1,
      eventId: "series-1",
      eventMemberIds: ["user-1"],
      eventName: "Weekly class",
      seriesEnded: true,
      teamId: "team-1",
    });

    expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
      body: "The upcoming sessions of Weekly class have been cancelled.",
      title: "❌ Upcoming sessions cancelled",
    });
  });

  it("names the session's date in India time for one session", async () => {
    await notifyEventCancelled({
      cancelledAt: 1,
      eventId: "series-1",
      eventMemberIds: ["user-1"],
      eventName: "Weekly class",
      sessionStart: Date.UTC(2026, 9, 24, 4, 30),
      teamId: "team-1",
    });

    expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
      body: "The Weekly class session on Sat, 24 Oct, 10:00 am has been cancelled.",
      title: "❌ Session cancelled",
      whatsappTemplate: { name: "event_cancelled" },
    });
  });

  it("names the first date for this and following", async () => {
    await notifyEventCancelled({
      cancelledAt: 1,
      eventId: "series-1",
      eventMemberIds: ["user-1"],
      eventName: "Weekly class",
      seriesEnded: true,
      sessionStart: Date.UTC(2026, 9, 24, 4, 30),
      teamId: "team-1",
    });

    expect(mocks.sendBulkMessage.mock.calls[0]?.[0]).toMatchObject({
      body: "The Weekly class sessions from Sat, 24 Oct, 10:00 am onwards have been cancelled.",
      title: "❌ Sessions cancelled",
    });
  });
});
