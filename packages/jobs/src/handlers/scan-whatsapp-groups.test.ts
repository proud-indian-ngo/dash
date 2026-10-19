import { beforeEach, describe, expect, it, mock } from "bun:test";

const DAY_MS = 24 * 60 * 60 * 1000;

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => ({
  deactivated: [] as unknown[],
  enqueue: mock(async (_name: string, _data: unknown) => "job-1"),
  /** Results for each `db.select()`: active users, then inactive users. */
  selects: [] as unknown[][],
}));

mock.module("@pi-dash/db", () => ({
  db: {
    select: () => ({
      from: () => ({ where: async () => mocks.selects.shift() ?? [] }),
    }),
    transaction: async (
      run: (tx: {
        update: () => { set: (values: unknown) => unknown };
      }) => Promise<void>
    ) =>
      await run({
        update: () => ({
          set: (values: unknown) => ({
            where: async () => {
              mocks.deactivated.push(values);
            },
          }),
        }),
      }),
  },
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: mock(async () => []),
}));
mock.module("@pi-dash/notifications/send/reminders", () => ({
  notifyWhatsAppScanResults: mock(async () => undefined),
}));
mock.module("@pi-dash/whatsapp/groups", () => ({
  getGroupInfoByConfigKey: mock(async (key: string) =>
    key === "all_volunteers_group_id"
      ? { jid: "all@g.us", name: "All volunteers" }
      : null
  ),
  getGroupParticipants: mock(async () => ["919000000000"]),
}));
mock.module("../enqueue", () => ({ enqueue: mocks.enqueue }));

const { handleScanWhatsAppGroups } = await import("./scan-whatsapp-groups");

function activeUser(id: string, daysOld: number, role = "volunteer") {
  return {
    createdAt: new Date(Date.now() - daysOld * DAY_MS),
    id,
    name: id,
    phone: `+9191000000${id.padStart(2, "0")}`,
    role,
  };
}

beforeEach(() => {
  mock.clearAllMocks();
  mocks.deactivated.length = 0;
});

describe("handleScanWhatsAppGroups", () => {
  it("reminds users in their second to fifth week and deactivates only those past a month", async () => {
    const remindedUnoriented = activeUser("2", 20, "unoriented_volunteer");
    mocks.selects = [
      [
        activeUser("1", 3),
        remindedUnoriented,
        activeUser("3", 10),
        activeUser("4", 31),
      ],
      [],
    ];

    await handleScanWhatsAppGroups([]);

    expect(mocks.deactivated).toEqual([{ isActive: false }]);
    expect(mocks.enqueue.mock.calls).toEqual([
      [
        "whatsapp-manage-orientation",
        {
          isOriented: false,
          joinBy: new Date(
            remindedUnoriented.createdAt.getTime() + 30 * DAY_MS
          ).toISOString(),
          userId: "2",
        },
      ],
      [
        "whatsapp-manage-orientation",
        expect.objectContaining({ isOriented: true, userId: "3" }),
      ],
    ]);
  });

  it("deactivates nobody while every user is inside the grace period", async () => {
    mocks.selects = [[activeUser("1", 3), activeUser("2", 29)], []];

    await handleScanWhatsAppGroups([]);

    expect(mocks.deactivated).toEqual([]);
  });
});
