import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cloudEnabled: true,
  getEnabledUserPhonesForTopic: vi.fn(
    async (_ids: string[], _topic: string) => new Map<string, string>()
  ),
  /** Results for each awaited `db.select()`, in order. */
  selects: [] as unknown[][],
  sendWhatsAppNotification: vi.fn(
    async (
      _phone: string,
      _notification: unknown,
      _options: { idempotencyKey: string; userId?: string }
    ): Promise<string> => "sent"
  ),
}));

vi.mock("@pi-dash/db", () => {
  const chain = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") {
            return (resolve: (v: unknown) => void) =>
              resolve(mocks.selects.shift() ?? []);
          }
          return () => chain();
        },
      }
    );
  return { db: { select: () => chain() } };
});
vi.mock("@pi-dash/env/server", () => ({ env: {} }));
vi.mock("./client", () => ({
  getWhatsAppApiUrl: () => "https://gowa.test",
  getWhatsAppHeaders: () => ({}),
}));
vi.mock("./cloud", () => ({ isCloudApiEnabled: () => mocks.cloudEnabled }));
vi.mock("./notify", () => ({
  sendWhatsAppNotification: mocks.sendWhatsAppNotification,
}));
vi.mock("./preferences", () => ({
  getEnabledUserPhonesForTopic: mocks.getEnabledUserPhonesForTopic,
}));
vi.mock("evlog", () => ({
  createRequestLogger: () => ({
    emit: vi.fn(),
    error: vi.fn(),
    set: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { addOrInviteToWhatsAppGroup, inviteToWhatsAppGroup } from "./groups";

const GROUP = { id: "g1", name: "Sunday Teaching Volunteers" };

function participantsResponse(phones: string[]) {
  return new Response(
    JSON.stringify({
      results: {
        Participants: phones.map((p) => ({
          PhoneNumber: `${p}@s.whatsapp.net`,
        })),
      },
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cloudEnabled = true;
  mocks.selects = [];
  mocks.sendWhatsAppNotification.mockImplementation(async () => "sent");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => participantsResponse(["911111111111"]))
  );
});

describe("inviteToWhatsAppGroup", () => {
  it("invites team members once, skipping people already in the group", async () => {
    // group, then the team that owns it
    mocks.selects = [[GROUP], [{ name: "Sunday Teaching" }]];
    mocks.getEnabledUserPhonesForTopic.mockResolvedValueOnce(
      new Map([
        ["u1", "911111111111"],
        ["u2", "922222222222"],
      ])
    );

    const result = await inviteToWhatsAppGroup("jid@g.us", ["u1", "u2"]);

    expect(mocks.getEnabledUserPhonesForTopic).toHaveBeenCalledWith(
      ["u1", "u2"],
      "Teams"
    );
    expect(result).toEqual({
      alreadyMember: 1,
      invited: 1,
      optedOut: 0,
      rejected: 0,
    });
    expect(mocks.sendWhatsAppNotification).toHaveBeenCalledTimes(1);
    const [phone, notification, options] =
      mocks.sendWhatsAppNotification.mock.calls[0] ?? [];
    expect(phone).toBe("922222222222");
    expect(notification).toMatchObject({
      template: {
        name: "group_invite",
        params: {
          group: "Sunday Teaching Volunteers",
          joined: "the team Sunday Teaching",
        },
        path: "whatsapp-groups/g1/join",
      },
    });
    expect(options?.idempotencyKey).toMatch(
      /^group-invite-g1-u2-\d{4}-\d{2}-\d{2}$/
    );
  });

  it("sends the join reminder with the India date when given a deadline", async () => {
    // group, then no team or event: an app-wide group
    mocks.selects = [[GROUP], [], []];
    mocks.getEnabledUserPhonesForTopic.mockResolvedValueOnce(
      new Map([["u2", "922222222222"]])
    );

    await inviteToWhatsAppGroup(
      "jid@g.us",
      ["u2"],
      new Date("2026-11-17T20:00:00Z")
    );

    expect(mocks.sendWhatsAppNotification.mock.calls[0]?.[1]).toMatchObject({
      template: {
        name: "group_join_reminder",
        params: { date: "Wed, 18 Nov", group: "Sunday Teaching Volunteers" },
        path: "whatsapp-groups/g1/join",
      },
    });
    expect(mocks.sendWhatsAppNotification.mock.calls[0]?.[2]).toMatchObject({
      idempotencyKey: expect.stringMatching(/^group-join-reminder-g1-u2-/),
    });
  });

  it("does not re-add anyone for a reminder while the Cloud API is off", async () => {
    mocks.cloudEnabled = false;

    await addOrInviteToWhatsAppGroup(
      "jid@g.us",
      "922222222222",
      "u2",
      new Date("2026-11-17T20:00:00Z")
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.sendWhatsAppNotification).not.toHaveBeenCalled();
  });

  it("uses the Events setting for event groups and counts people who opted out", async () => {
    mocks.selects = [[GROUP], [], [{ name: "Science Fair" }]];
    mocks.getEnabledUserPhonesForTopic.mockResolvedValueOnce(
      new Map([["u2", "922222222222"]])
    );

    const result = await inviteToWhatsAppGroup("jid@g.us", ["u2", "u3"]);

    expect(mocks.getEnabledUserPhonesForTopic).toHaveBeenCalledWith(
      ["u2", "u3"],
      "Events - Schedule"
    );
    expect(result.optedOut).toBe(1);
    expect(mocks.sendWhatsAppNotification.mock.calls[0]?.[1]).toMatchObject({
      template: { params: { joined: "the event Science Fair" } },
    });
  });

  it("keeps going past a failure and rethrows a transient one at the end", async () => {
    mocks.selects = [[GROUP], [{ name: "Sunday Teaching" }]];
    mocks.getEnabledUserPhonesForTopic.mockResolvedValueOnce(
      new Map([
        ["u2", "922222222222"],
        ["u3", "933333333333"],
        ["u4", "944444444444"],
      ])
    );
    mocks.sendWhatsAppNotification
      .mockRejectedValueOnce(new Error("rate limited"))
      .mockResolvedValueOnce("rejected")
      .mockResolvedValueOnce("sent");

    await expect(
      inviteToWhatsAppGroup("jid@g.us", ["u2", "u3", "u4"])
    ).rejects.toThrow("rate limited");
    expect(mocks.sendWhatsAppNotification).toHaveBeenCalledTimes(3);
  });

  it("does nothing for a group pi-dash doesn't know", async () => {
    mocks.selects = [[]];
    const result = await inviteToWhatsAppGroup("unknown@g.us", ["u1"]);
    expect(result.invited).toBe(0);
    expect(mocks.sendWhatsAppNotification).not.toHaveBeenCalled();
  });
});
