import { beforeEach, describe, expect, it, mock } from "bun:test";

const DAY = 86_400_000;

const state = {
  docs: [] as {
    certificateId: string | null;
    createdAt: Date;
    declarationId: string | null;
    id: string;
    meetingId: string | null;
  }[],
  minutes: "waiting" as "recorded" | "signed" | "waiting",
};
const calls = { collected: [] as string[], dropped: [] as string[] };

class Refused extends Error {}

mock.module("@pi-dash/db/queries/esign", () => ({
  openEsignCircularIds: async () => [],
  openEsignDocuments: async () => state.docs,
  unclosedDecidedEsignCircularIds: async () => [],
}));
mock.module("@pi-dash/db/queries/meetings", () => ({ MeetingError: Refused }));
mock.module("@pi-dash/db/queries/policies", () => ({
  DeclarationError: Refused,
}));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  getCircular: async () => null,
  ResolutionError: Refused,
}));
mock.module("@pi-dash/db/queries/utilisation-certificates", () => ({
  CertificateError: Refused,
}));
mock.module("@pi-dash/jobs/handlers/create-handler", () => ({
  withDefaultOutput: () => () => undefined,
}));
mock.module("@pi-dash/jobs/handlers/resolutions", () => ({
  closeDueCircular: async () => [],
}));
mock.module("./esign", () => ({
  closeEsignDocument: async () => undefined,
  collectEsignatures: async () => [],
  dropEsignDocument: async (doc: { id: string }) => {
    calls.dropped.push(doc.id);
  },
}));
mock.module("./esign-documents", () => ({
  collectCertificateEsign: async (id: string) => {
    calls.collected.push(`certificate:${id}`);
    return 2;
  },
  collectDeclarationEsign: async (id: string) => {
    calls.collected.push(`declaration:${id}`);
    throw new Refused("refused");
  },
  collectMinutesEsign: async (id: string) => {
    calls.collected.push(`minutes:${id}`);
    return state.minutes;
  },
}));

const { collectOpenEsignatures } = await import("./esign-worker");

function doc(
  id: string,
  target: {
    certificateId?: string;
    declarationId?: string;
    meetingId?: string;
  },
  ageDays = 1
) {
  return {
    certificateId: target.certificateId ?? null,
    createdAt: new Date(Date.now() - ageDays * DAY),
    declarationId: target.declarationId ?? null,
    id,
    meetingId: target.meetingId ?? null,
  };
}

beforeEach(() => {
  calls.collected.length = 0;
  calls.dropped.length = 0;
  state.minutes = "waiting";
});

describe("collectOpenEsignatures", () => {
  it("collects each open document by its target, one refusal leaving the rest", async () => {
    state.docs = [
      doc("e1", { meetingId: "m1" }),
      doc("e2", { declarationId: "d1" }),
      doc("e3", { certificateId: "c1" }),
    ];
    state.minutes = "recorded";
    const result = await collectOpenEsignatures("2026-10-31");
    expect(calls.collected).toEqual([
      "minutes:m1",
      "declaration:d1",
      "certificate:c1",
    ]);
    expect(result).toMatchObject({ checked: 3, failed: 1, recorded: 3 });
    expect(calls.dropped).toEqual([]);
  });

  it("withdraws a lapsed document after a last check", async () => {
    state.docs = [
      doc("old", { meetingId: "m1" }, 32),
      doc("new", { meetingId: "m2" }, 29),
      doc("refused", { declarationId: "d1" }, 40),
    ];
    await collectOpenEsignatures("2026-10-31");
    expect(calls.collected).toEqual([
      "minutes:m1",
      "minutes:m2",
      "declaration:d1",
    ]);
    expect(calls.dropped).toEqual(["old", "refused"]);
  });
});
