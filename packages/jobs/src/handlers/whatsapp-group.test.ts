import { beforeEach, describe, expect, it, mock } from "bun:test";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  createWhatsAppGroup: mock(async () => ({ jid: "123@g.us" })),
  enqueue: mock(async () => "job-1"),
  getUserPhone: mock(async () => "+919800000000"),
  insertValues: mock(async () => undefined),
  memberRows: [] as { userId: string }[],
  selectFrom: [] as unknown[],
  updateSet: [] as unknown[],
}));

mock.module("@pi-dash/db", () => ({
  db: {
    insert: () => ({ values: mocks.insertValues }),
    select: () => ({
      from: (table: unknown) => {
        mocks.selectFrom.push(table);
        return { where: async () => mocks.memberRows };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        mocks.updateSet.push(values);
        return { where: async () => undefined };
      },
    }),
  },
}));
mock.module("@pi-dash/whatsapp/cloud", () => ({
  isCloudApiEnabled: () => false,
}));
mock.module("@pi-dash/whatsapp/groups", () => ({
  addOrInviteToWhatsAppGroup: mock(),
  addUsersToWhatsAppGroup: mock(),
  createWhatsAppGroup: mocks.createWhatsAppGroup,
  getTeamWhatsAppGroupJid: mock(),
  inviteToWhatsAppGroup: mock(),
  manageOrientationGroupMembership: mock(),
  removeFromWhatsAppGroup: mock(),
}));
mock.module("@pi-dash/whatsapp/users", () => ({
  getUserPhone: mocks.getUserPhone,
  getUserPhones: mock(),
}));
mock.module("../enqueue", () => ({ enqueue: mocks.enqueue }));
mock.module("uuidv7", () => ({ uuidv7: () => "group-1" }));

const { handleWhatsAppCreateGroup } = await import("./whatsapp-group");
const { teamMember } = await import("@pi-dash/db/schema/team");
const { teamEventMember } = await import("@pi-dash/db/schema/team-event");

function job(entityType: "event" | "team", entityId: string) {
  return {
    data: { creatorUserId: "creator", entityId, entityType, groupName: "G" },
    id: "job-1",
  } as never;
}

beforeEach(() => {
  mock.clearAllMocks();
  mocks.memberRows = [];
  mocks.selectFrom.length = 0;
  mocks.updateSet.length = 0;
});

describe("handleWhatsAppCreateGroup", () => {
  it("links the group, then adds the team's members except the creator", async () => {
    mocks.memberRows = [
      { userId: "creator" },
      { userId: "u1" },
      { userId: "u2" },
    ];

    await handleWhatsAppCreateGroup([job("team", "t1")]);

    expect(mocks.createWhatsAppGroup).toHaveBeenCalledWith("G", [
      "+919800000000",
    ]);
    expect(mocks.updateSet).toEqual([{ whatsappGroupId: "group-1" }]);
    expect(mocks.selectFrom).toEqual([teamMember]);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "whatsapp-add-members",
      { groupId: "group-1", userIds: ["u1", "u2"] },
      { singletonKey: "whatsapp-link-team-t1-group-1" }
    );
  });

  it("reads event members for an event group", async () => {
    mocks.memberRows = [{ userId: "u3" }];

    await handleWhatsAppCreateGroup([job("event", "e1")]);

    expect(mocks.selectFrom).toEqual([teamEventMember]);
    expect(mocks.enqueue).toHaveBeenCalledWith(
      "whatsapp-add-members",
      { groupId: "group-1", userIds: ["u3"] },
      { singletonKey: "whatsapp-link-event-e1-group-1" }
    );
  });

  it("queues nothing when no one else is on the team yet", async () => {
    mocks.memberRows = [{ userId: "creator" }];

    await handleWhatsAppCreateGroup([job("team", "t1")]);

    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("doesn't fail the job, and so create a second group, when queueing fails", async () => {
    mocks.memberRows = [{ userId: "u1" }];
    mocks.enqueue.mockRejectedValueOnce(new Error("queue down"));

    await handleWhatsAppCreateGroup([job("team", "t1")]);

    expect(mocks.updateSet).toEqual([{ whatsappGroupId: "group-1" }]);
  });
});
