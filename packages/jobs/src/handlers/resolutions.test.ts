import { beforeEach, describe, expect, it, mock } from "bun:test";

const decided: string[] = [];
const enqueued: unknown[][] = [];
const notices: Record<string, unknown>[] = [];
let overdue: string[] = [];
let statuses: Record<string, string> = {};
let circulars: Record<string, string[]> = {};

mock.module("@pi-dash/db/queries/resolutions", () => ({
  circularRecipients: async () => [
    { trusteeId: "a", userId: "user-a" },
    { trusteeId: "b", userId: null },
  ],
  circularResolutions: async () => [
    { status: "issued", title: "Appointment of Meera Iyer" },
    { status: "issued", title: "Meera Iyer as Secretary" },
  ],
  decideCircular: async (
    id: string,
    _today: string,
    then: (tx: unknown, decisions: unknown[]) => Promise<void>
  ) => {
    const decisions = (circulars[id] ?? []).map((resolutionId) => ({
      number: null,
      resolutionId,
      status: statuses[resolutionId] ?? "issued",
      tally: {},
    }));
    // A throw from `then` rolls the decisions back.
    await then(`tx-${id}`, decisions);
    decided.push(id);
    return decisions;
  },
  getResolution: async (id: string) => ({
    circularId: "c1",
    id,
    position: Number(id.slice(1)),
    number: null,
    outcomeNote:
      "Only 1 of the 2 signatures needed arrived by the response date.",
    status: statuses[id] ?? "issued",
    title: `Circular ${id}`,
  }),
  getCircular: async (id: string) => ({ id, responseDueOn: "2026-10-25" }),
  overdueCircularIds: async () => overdue,
  resolutionRecipients: async () => [
    { response: "assent", trusteeId: "a", userId: "user-a" },
    { response: "pending", trusteeId: "b", userId: null },
  ],
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: async () => ["secretary", "user-a"],
}));
mock.module("@pi-dash/notifications/send/governance", () => ({
  notifyResolutionsDecided: async (notice: Record<string, unknown>) => {
    notices.push({ kind: "decided", ...notice });
  },
  notifyCircularIssued: async (notice: Record<string, unknown>) => {
    notices.push({ kind: "issued", ...notice });
  },
}));
let enqueueFails = false;
mock.module("../enqueue", () => ({
  enqueue: async (...args: unknown[]) => {
    if (enqueueFails) {
      throw new Error("pg-boss unavailable");
    }
    enqueued.push(args);
    return "job-id";
  },
  inTransaction: (tx: unknown) => ({ tx }),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: () => undefined,
    warn: () => undefined,
  }),
}));

const {
  handleCloseDueResolutions,
  handleNotifyCircularIssued,
  handleNotifyResolutionDecided,
} = await import("./resolutions");

describe("handleCloseDueResolutions", () => {
  beforeEach(() => {
    decided.length = 0;
    enqueued.length = 0;
    notices.length = 0;
    overdue = [];
    statuses = {};
    circulars = {};
    enqueueFails = false;
  });

  it("closes every overdue circular and queues one notice for it", async () => {
    overdue = ["c1"];
    circulars = { c1: ["r1", "r2"] };
    statuses = { r1: "failed", r2: "failed" };
    const result = await handleCloseDueResolutions([], "2026-10-26");
    expect(result).toEqual({ closed: 2 });
    expect(decided).toEqual(["c1"]);
    // Queued rather than sent, so pg-boss retries a failed delivery.
    expect(notices).toEqual([]);
    expect(enqueued).toEqual([
      [
        "notify-resolution-decided",
        { resolutionIds: ["r1", "r2"] },
        { db: { tx: "tx-c1" }, singletonKey: "r1-failed_r2-failed" },
      ],
    ]);
  });

  it("leaves a circular open when its notice can't be queued", async () => {
    overdue = ["c1"];
    circulars = { c1: ["r1"] };
    statuses = { r1: "failed" };
    enqueueFails = true;
    await expect(handleCloseDueResolutions([], "2026-10-26")).rejects.toThrow(
      "pg-boss unavailable"
    );
    expect(decided).toEqual([]);
  });

  it("tells the trustees and secretaries once, listing each resolution", async () => {
    statuses = { r1: "failed", r2: "failed" };
    await handleNotifyResolutionDecided([
      {
        data: { resolutionIds: ["r2", "r1"] },
        id: "job-1",
        name: "notify-resolution-decided",
      },
    ] as never);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ circularId: "c1", kind: "decided" });
    const listed = (notices[0]?.resolutions ?? []) as {
      outcome: string;
      position: number;
    }[];
    expect(listed.map((r) => [r.position, r.outcome])).toEqual([
      [1, "failed"],
      [2, "failed"],
    ]);
    expect(
      [...((notices[0]?.userIds as string[] | undefined) ?? [])].sort()
    ).toEqual(["secretary", "user-a"]);
  });

  it("does nothing when nothing is overdue", async () => {
    expect(await handleCloseDueResolutions([], "2026-10-26")).toEqual({
      closed: 0,
    });
    expect(enqueued).toEqual([]);
  });
});

describe("handleNotifyCircularIssued", () => {
  beforeEach(() => {
    notices.length = 0;
  });

  it("asks each trustee with an account once for the whole circular", async () => {
    await handleNotifyCircularIssued([
      {
        data: { circularId: "c1" },
        id: "job-1",
        name: "notify-circular-issued",
      },
    ] as never);
    expect(notices).toEqual([
      {
        circularId: "c1",
        kind: "issued",
        responseDueOn: "2026-10-25",
        titles: ["Appointment of Meera Iyer", "Meera Iyer as Secretary"],
        userIds: ["user-a"],
      },
    ]);
  });
});
