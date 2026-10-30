import { describe, expect, it, mock } from "bun:test";

const updates: Record<string, unknown>[] = [];

mock.module("@pi-dash/db/queries/signing", () => ({
  archivesDue: async () => [
    {
      archiveObjectKey: "p/governance/resolutions/r1/final-ltv.pdf",
      neverMade: false,
      target: { documentId: "d1" },
    },
    {
      archiveObjectKey: "p/governance/resolutions/r2/final-ltv-2026-10-10.pdf",
      neverMade: false,
      target: { documentId: "d2" },
    },
  ],
  setArchiveCopy: async (
    target: Record<string, string>,
    copy: Record<string, unknown>
  ) => {
    updates.push({ ...target, ...copy });
  },
}));
mock.module("@pi-dash/db/queries/utilisation-certificates", () => ({
  fileFinalCertificate: async () => undefined,
  unfiledFinalCertificates: async () => [],
}));
mock.module("@pi-dash/db/queries/esign", () => ({
  isEsignVaultDocument: async () => false,
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
  it("renews each due copy, an eSign one through the plugin, and keeps a failed one due", async () => {
    const written: string[] = [];
    const steps: boolean[] = [];
    const result = await handleRetimestampGovernanceArchives([], "2027-10-10", {
      finalize: async () => {
        throw new Error("not a first copy");
      },
      // d1 is an eSign circular's copy.
      isEsign: async (target) =>
        "documentId" in target && target.documentId === "d1",
      read: async (key) => new TextEncoder().encode(key),
      retimestamp: async (pdf, { esign }) => {
        if (new TextDecoder().decode(pdf).includes("r2")) {
          throw new Error("tsa down");
        }
        steps.push(esign);
        return new Uint8Array([...pdf, 1]);
      },
      validate: async () => {
        throw new Error("nothing to file");
      },
      write: async (key) => {
        written.push(key);
      },
    });
    expect(result).toEqual({ due: 2, failed: 1, filed: 0, renewed: 1 });
    expect(written).toEqual([
      "p/governance/resolutions/r1/final-ltv-2027-10-10.pdf",
    ]);
    expect(updates).toEqual([
      expect.objectContaining({ documentId: "d1", renewOn: "2028-10-09" }),
    ]);
    expect(steps).toEqual([true]);
  });
});
