import { describe, expect, it, mock } from "bun:test";

const updates: Record<string, unknown>[] = [];

mock.module("@pi-dash/db/queries/signing", () => ({
  archivesDue: async () => [
    { archiveObjectKey: "p/governance/resolutions/r1/final-ltv.pdf", id: "d1" },
    {
      archiveObjectKey: "p/governance/resolutions/r2/final-ltv-2026-10-10.pdf",
      id: "d2",
    },
  ],
  setArchiveCopy: async (id: string, copy: Record<string, unknown>) => {
    updates.push({ id, ...copy });
  },
}));
mock.module("@pi-dash/env/server", () => ({ env: {} }));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: () => undefined,
    error: () => undefined,
    set: () => undefined,
  }),
}));

const { handleRetimestampGovernanceArchives, renewedKey } =
  await import("./retimestamp-governance-archives");

describe("renewedKey", () => {
  it("dates the renewed copy beside the old one", () => {
    expect(renewedKey("a/final-ltv.pdf", "2027-10-10")).toBe(
      "a/final-ltv-2027-10-10.pdf"
    );
    expect(renewedKey("a/final-ltv-2026-10-10.pdf", "2027-10-10")).toBe(
      "a/final-ltv-2027-10-10.pdf"
    );
  });
});

describe("handleRetimestampGovernanceArchives", () => {
  it("renews each due copy and keeps a failed one due", async () => {
    const written: string[] = [];
    const result = await handleRetimestampGovernanceArchives([], "2027-10-10", {
      read: async (key) => new TextEncoder().encode(key),
      retimestamp: async (pdf) => {
        if (new TextDecoder().decode(pdf).includes("r2")) {
          throw new Error("tsa down");
        }
        return new Uint8Array([...pdf, 1]);
      },
      write: async (key) => {
        written.push(key);
      },
    });
    expect(result).toEqual({ due: 2, failed: 1, renewed: 1 });
    expect(written).toEqual([
      "p/governance/resolutions/r1/final-ltv-2027-10-10.pdf",
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ id: "d1", renewOn: "2028-10-09" }),
    ]);
  });
});
