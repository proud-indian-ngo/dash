import { beforeEach, describe, expect, it, mock } from "bun:test";

const CANCELLED_AT = Date.parse("2026-10-20T06:00:00Z");

const ops: string[] = [];
let selects: unknown[][] = [];
let eventRows: { cancelledAt: Date | null }[] = [];

function selectChain(result: unknown[]) {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    limit: async () => result,
    where: () => chain,
  };
  return chain;
}

mock.module("@pi-dash/db", () => ({
  db: {
    delete: () => ({
      where: async () => {
        ops.push("delete");
      },
    }),
    insert: () => ({
      values: async () => {
        ops.push("insert");
      },
    }),
    query: { teamEvent: { findMany: async () => eventRows } },
    select: () => selectChain(selects.shift() ?? []),
    update: () => ({
      set: () => ({
        where: async () => {
          ops.push("update");
        },
      }),
    }),
  },
}));
mock.module("@pi-dash/whatsapp/messaging", () => ({
  sendWhatsAppGroupMessage: async () => {
    ops.push("group-message");
    return "wa-message";
  },
  sendWhatsAppPoll: async () => {
    ops.push("poll");
    return "wa-poll";
  },
}));
mock.module("@pi-dash/whatsapp/gowa-log", () => ({
  logGowaSend: async () => undefined,
}));
const notifyEventCancelled = mock(async () => undefined);
mock.module("@pi-dash/notifications/send/team-event", () => ({
  notifyAddedToEvent: mock(),
  notifyEventCancelled,
  notifyEventCreated: mock(),
  notifyEventProjectCleared: mock(),
  notifyEventUpdated: mock(),
  notifyRemovedFromEvent: mock(),
  notifyUsersAddedToEvent: mock(),
}));
mock.module("@pi-dash/notifications/send-message", () => ({
  captureSends: async (callback: () => Promise<unknown>) => ({
    result: await callback(),
    sends: [],
  }),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: () => undefined,
    warn: () => undefined,
  }),
}));

const { handleCloseRsvpPollOnCancel } =
  await import("./close-rsvp-poll-on-cancel");
const { handleNotifyEventCancelled } = await import("./notify-team-event");
const { handleSendSingleRsvpPoll } = await import("./send-single-rsvp-poll");

function job<T extends object>(data: T) {
  return [{ data, id: "job-1" } as never];
}

const cancel = {
  cancelledAt: CANCELLED_AT,
  cancelledEventIds: ["event-1"],
  eventId: "event-1",
  eventName: "Beach clean-up",
};

const openPoll = {
  closedAt: null,
  id: "poll-1",
  messageId: "wa-old",
  targetChatJid: "group@g.us",
};

beforeEach(() => {
  ops.length = 0;
  selects = [];
  eventRows = [];
  notifyEventCancelled.mockClear();
});

describe("close-rsvp-poll-on-cancel", () => {
  it("closes the poll while the cancel stands", async () => {
    eventRows = [{ cancelledAt: new Date(CANCELLED_AT) }];
    selects = [[openPoll]];

    await handleCloseRsvpPollOnCancel(job(cancel));

    expect(ops).toEqual(["group-message", "update"]);
  });

  it("leaves the poll open and the group quiet after a restore", async () => {
    eventRows = [{ cancelledAt: null }];
    selects = [[openPoll]];

    await handleCloseRsvpPollOnCancel(job(cancel));

    expect(ops).toEqual([]);
  });

  it("skips a cancel replaced by a later one", async () => {
    eventRows = [{ cancelledAt: new Date(CANCELLED_AT + 60_000) }];
    selects = [[openPoll]];

    await handleCloseRsvpPollOnCancel(job(cancel));

    expect(ops).toEqual([]);
  });
});

describe("notify-event-cancelled", () => {
  const notice = {
    ...cancel,
    eventMemberIds: ["user-1"],
    teamId: "team-1",
  };

  it("sends the notice while the cancel stands", async () => {
    eventRows = [{ cancelledAt: new Date(CANCELLED_AT) }];

    await handleNotifyEventCancelled(job(notice));

    expect(notifyEventCancelled).toHaveBeenCalledTimes(1);
  });

  it("skips the notice after a restore", async () => {
    eventRows = [{ cancelledAt: null }];

    const output = await handleNotifyEventCancelled(job(notice));

    expect(notifyEventCancelled).not.toHaveBeenCalled();
    expect(output.result).toEqual({ skipped: "restored" });
  });

  it("sends when the cancel marked no row (only unsaved sessions dropped)", async () => {
    await handleNotifyEventCancelled(job({ ...notice, cancelledEventIds: [] }));

    expect(notifyEventCancelled).toHaveBeenCalledTimes(1);
  });
});

describe("send-single-rsvp-poll", () => {
  const upcoming = {
    cancelledAt: null,
    eventWhatsappGroupId: null,
    name: "Beach clean-up",
    startTime: new Date(Date.now() + 86_400_000),
    teamWhatsappGroupId: "team-group",
  };

  it("replaces a poll a cancel closed, once the event is restored", async () => {
    selects = [
      [{ closedAt: new Date(CANCELLED_AT), id: "poll-1" }],
      [upcoming],
      [{ jid: "group@g.us" }],
      [{ cancelledAt: null }],
    ];

    await handleSendSingleRsvpPoll(job({ eventId: "event-1" }));

    expect(ops).toEqual(["delete", "insert", "poll", "update"]);
  });

  it("keeps an open poll", async () => {
    selects = [[{ closedAt: null, id: "poll-1" }]];

    await handleSendSingleRsvpPoll(job({ eventId: "event-1" }));

    expect(ops).toEqual([]);
  });

  it("keeps a poll closed by the event starting", async () => {
    selects = [
      [{ closedAt: new Date(CANCELLED_AT), id: "poll-1" }],
      [{ ...upcoming, startTime: new Date(Date.now() - 60_000) }],
    ];

    await handleSendSingleRsvpPoll(job({ eventId: "event-1" }));

    expect(ops).toEqual([]);
  });
});
