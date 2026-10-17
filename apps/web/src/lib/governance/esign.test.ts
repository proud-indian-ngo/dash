import { beforeEach, describe, expect, it, mock } from "bun:test";

const settleEsign = mock(async () => true);
const currentRevision = mock(
  async (): Promise<{
    latestObjectKey: string;
    latestSha256: string;
  } | null> => ({
    latestObjectKey: "latest.pdf",
    latestSha256: "sha-current",
  })
);
const fetchSignedFile = mock(
  async (): Promise<
    | { kind: "pending" }
    | { kind: "ended"; reason: "expired" | "rejected" }
    | { bytes: Uint8Array; kind: "signed" }
  > => ({ kind: "pending" })
);
const acceptSignedPdf = mock(async () => ({
  number: "PI/TR/2026-27/004",
  status: "passed",
}));
const CURRENT = new Uint8Array([1, 2, 3]);

mock.module("@pi-dash/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ id: "trustee-1", legalName: "Asha Rao" }],
        }),
      }),
    }),
  },
}));
mock.module("@pi-dash/db/queries/signing", () => ({
  esignByDocumentId: mock(),
  latestEsignFor: mock(),
  recordEsignRequest: mock(),
  settleEsign,
}));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  currentRevision,
  getResolution: mock(),
  responseFor: mock(),
}));
mock.module("@pi-dash/db/queries/governance", () => ({
  getTrusteePrivate: mock(),
}));
mock.module("../s3", () => ({
  getS3: async () => ({
    file: () => ({ arrayBuffer: async () => CURRENT.buffer }),
  }),
}));
mock.module("./accept-signature", () => ({ acceptSignedPdf }));
mock.module("./leegality", () => ({
  createEsignRequest: mock(),
  fetchSignedFile,
  leegalityConfig: () => ({
    apiUrl: "https://sandbox.leegality.com/api",
    authToken: "t",
    privateSalt: "s",
    profileId: "p",
  }),
}));

const { completeEsign, leegalityPhone } = await import("./esign");

const pending = {
  basedOnSha256: "sha-current",
  completedAt: null,
  createdAt: new Date(),
  error: null,
  id: "esign-1",
  providerDocumentId: "DOC1",
  resolutionId: "resolution-1",
  status: "pending" as const,
  trusteeId: "trustee-1",
  userId: "user-1",
};

describe("completeEsign", () => {
  beforeEach(() => {
    settleEsign.mockClear();
    acceptSignedPdf.mockClear();
  });

  it("waits while Leegality has no signature", async () => {
    fetchSignedFile.mockResolvedValueOnce({ kind: "pending" });
    expect(await completeEsign(pending)).toEqual({ status: "pending" });
    expect(settleEsign).not.toHaveBeenCalled();
  });

  it("records the signature when the PDF only gained one", async () => {
    fetchSignedFile.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
      kind: "signed",
    });
    expect(await completeEsign(pending)).toEqual({
      number: "PI/TR/2026-27/004",
      resolutionStatus: "passed",
      status: "signed",
    });
    expect(acceptSignedPdf).toHaveBeenCalledWith(
      expect.objectContaining({ method: "esign", resolutionId: "resolution-1" })
    );
    expect(settleEsign).toHaveBeenCalledWith("esign-1", {
      status: "completed",
    });
  });

  it("refuses a rewritten PDF, which would break earlier signatures", async () => {
    fetchSignedFile.mockResolvedValueOnce({
      bytes: new Uint8Array([9, 2, 3, 4]),
      kind: "signed",
    });
    const outcome = await completeEsign(pending);
    expect(outcome).toMatchObject({ status: "failed" });
    expect(outcome.status === "failed" && outcome.message).toContain(
      "rewritten PDF"
    );
    expect(acceptSignedPdf).not.toHaveBeenCalled();
  });

  it("refuses a copy someone else signed past in the meantime", async () => {
    currentRevision.mockResolvedValueOnce({
      latestObjectKey: "latest.pdf",
      latestSha256: "sha-newer",
    });
    fetchSignedFile.mockResolvedValueOnce({
      bytes: new Uint8Array([1, 2, 3, 4]),
      kind: "signed",
    });
    expect(await completeEsign(pending)).toMatchObject({ status: "failed" });
    expect(acceptSignedPdf).not.toHaveBeenCalled();
  });

  it("does nothing more for a settled request", async () => {
    expect(
      await completeEsign({ ...pending, status: "completed" })
    ).toMatchObject({ status: "signed" });
    expect(fetchSignedFile).toHaveBeenCalledTimes(4);
  });
});

describe("leegalityPhone", () => {
  it("sends ten digits, from any Indian format", () => {
    expect(leegalityPhone("+91 98765 43210")).toBe("9876543210");
    expect(leegalityPhone("9876543210")).toBe("9876543210");
    expect(leegalityPhone("98765")).toBeNull();
    expect(leegalityPhone(null)).toBeNull();
  });
});
