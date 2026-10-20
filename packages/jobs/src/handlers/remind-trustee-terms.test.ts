import { beforeEach, describe, expect, it, mock } from "bun:test";

const sent: Record<string, unknown>[] = [];
let terms: Record<string, unknown>[] = [];

mock.module("@pi-dash/db/queries/governance", () => ({
  minTrusteesOn: async () => 2,
  openTrusteeTerms: async () => terms,
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: async () => ["secretary-user"],
}));
mock.module("@pi-dash/notifications/send/governance", () => ({
  notifyTermEnding: async (options: Record<string, unknown>) => {
    sent.push(options);
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

const { handleRemindTrusteeTerms } = await import("./remind-trustee-terms");

function term(overrides: Record<string, unknown>) {
  return {
    basis: "co_option_4_5",
    endEvidenceDocumentId: null,
    endedOn: null,
    endsOn: null,
    id: "t-1",
    legalName: "Asha Rao",
    startEvidenceDocumentId: null,
    startsOn: "2019-03-16",
    trusteeId: "asha",
    userId: null,
    ...overrides,
  };
}

describe("handleRemindTrusteeTerms", () => {
  beforeEach(() => {
    sent.length = 0;
    terms = [
      term({}),
      term({
        endsOn: "2028-12-06",
        id: "t-2",
        legalName: "Vikram Menon",
        startsOn: "2025-12-07",
        trusteeId: "vikram",
        userId: "vikram-user",
      }),
    ];
  });

  it("does nothing when no term ends on a reminder day", async () => {
    const result = await handleRemindTrusteeTerms([], "2028-01-01");
    expect(result).toEqual({ failures: 0, notified: 0, terms: 0 });
    expect(sent).toEqual([]);
  });

  it("tells the trustee and the secretaries 30 days ahead, and flags a short board", async () => {
    const result = await handleRemindTrusteeTerms([], "2028-11-06");
    expect(result.terms).toBe(1);
    expect(sent.map((s) => s.userId).sort()).toEqual([
      "secretary-user",
      "vikram-user",
    ]);
    const own = sent.find((s) => s.userId === "vikram-user");
    expect(own).toMatchObject({
      daysLeft: 30,
      isOwnTerm: true,
      lastDay: "2028-12-06",
      leavesBoardShort: true,
      termId: "t-2",
    });
  });

  it("doesn't flag a short board when enough trustees remain", async () => {
    terms.push(
      term({ id: "t-3", legalName: "Meera Iyer", trusteeId: "meera" })
    );
    await handleRemindTrusteeTerms([], "2028-11-29");
    expect(sent[0]).toMatchObject({ daysLeft: 7, leavesBoardShort: false });
  });
});
