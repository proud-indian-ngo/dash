import { beforeEach, describe, expect, it, mock } from "bun:test";

const decided: string[] = [];
const notices: Record<string, unknown>[] = [];
let overdue: string[] = [];
let statuses: Record<string, string> = {};

mock.module("@pi-dash/db/queries/resolutions", () => ({
  decideResolution: async (id: string) => {
    decided.push(id);
    return { number: null, status: statuses[id] ?? "issued", tally: {} };
  },
  getResolution: async (id: string) => ({
    id,
    number: null,
    outcomeNote:
      "Only 1 of the 2 signatures needed arrived by the response date.",
    responseDueOn: "2026-10-25",
    status: statuses[id] ?? "issued",
    title: `Circular ${id}`,
  }),
  overdueResolutionIds: async () => overdue,
  resolutionRecipients: async () => [
    { response: "assent", trusteeId: "a", userId: "user-a" },
    { response: "pending", trusteeId: "b", userId: null },
  ],
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: async () => ["secretary", "user-a"],
}));
mock.module("@pi-dash/notifications/send/governance", () => ({
  notifyResolutionDecided: async (notice: Record<string, unknown>) => {
    notices.push({ kind: "decided", ...notice });
  },
  notifyResolutionIssued: async (notice: Record<string, unknown>) => {
    notices.push({ kind: "issued", ...notice });
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: () => undefined,
    warn: () => undefined,
  }),
}));

const { handleCloseDueResolutions } = await import("./resolutions");

describe("handleCloseDueResolutions", () => {
  beforeEach(() => {
    decided.length = 0;
    notices.length = 0;
    overdue = [];
    statuses = {};
  });

  it("closes every overdue circular and tells the trustees and secretaries once each", async () => {
    overdue = ["r1"];
    statuses = { r1: "failed" };
    const result = await handleCloseDueResolutions([], "2026-10-26");
    expect(result).toEqual({ closed: 1 });
    expect(decided).toEqual(["r1"]);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({ kind: "decided", outcome: "failed" });
    expect(
      [...((notices[0]?.userIds as string[] | undefined) ?? [])].sort()
    ).toEqual(["secretary", "user-a"]);
  });

  it("does nothing when nothing is overdue", async () => {
    expect(await handleCloseDueResolutions([], "2026-10-26")).toEqual({
      closed: 0,
    });
    expect(notices).toEqual([]);
  });
});
