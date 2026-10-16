import { describe, expect, it, mock } from "bun:test";

const sent: Record<string, unknown>[] = [];

mock.module("@pi-dash/db/queries/compliance", () => ({
  generateComplianceItems: async () => 3,
  openItemsDueSoon: async () => [
    {
      dueOn: "2026-10-31",
      id: "itr",
      ownerUserId: null,
      status: "open",
      title: "ITR-7",
    },
    {
      dueOn: "2026-10-24",
      id: "tds",
      ownerUserId: "finance",
      status: "open",
      title: "TDS (Q2)",
    },
    {
      dueOn: "2026-10-20",
      id: "x",
      ownerUserId: "finance",
      status: "open",
      title: "Other",
    },
  ],
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: async () => ["sec-1", "sec-2"],
}));
mock.module("@pi-dash/notifications/send/governance", () => ({
  notifyComplianceDue: async (options: Record<string, unknown>) => {
    sent.push(options);
  },
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ emit: () => undefined, set: () => undefined }),
}));

const { handleGenerateComplianceItems, handleRemindComplianceItems } =
  await import("./compliance");

describe("compliance jobs", () => {
  it("reports how many items it created", async () => {
    expect(await handleGenerateComplianceItems([], "2026-10-01")).toEqual({
      created: 3,
    });
  });

  it("reminds the owner, or every secretary when there is none", async () => {
    const result = await handleRemindComplianceItems([], "2026-10-17");
    // ITR-7 is 14 days out (no reminder); TDS is 7 days out (owner only).
    expect(result).toEqual({ failures: 0, notified: 1 });
    expect(sent).toEqual([
      expect.objectContaining({
        daysLeft: 7,
        itemId: "tds",
        userId: "finance",
      }),
    ]);
    sent.length = 0;
    await handleRemindComplianceItems([], "2026-10-01");
    expect(sent.map((s) => s.userId).sort()).toEqual(["sec-1", "sec-2"]);
  });
});
