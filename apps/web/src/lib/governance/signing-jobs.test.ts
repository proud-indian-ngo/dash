import { beforeEach, describe, expect, it, mock } from "bun:test";

/** A throwaway test certificate: CN=ASHA RAO, from a test CA, RSA, 2026 to 2099. */
const ASHA_CERT =
  "MIIC0zCCAbugAwIBAgIUMkaHVPEYKxtKDDFN2U7Ypz7TzfswDQYJKoZIhvcNAQELBQAwJTELMAkGA1UEBhMCSU4xFjAUBgNVBAMMDVRlc3QgQ0NBIFJvb3QwIBcNMjYwMTAxMDAwMDAwWhgPMjA5OTEyMzEwMDAwMDBaMCAxCzAJBgNVBAYTAklOMREwDwYDVQQDDAhBU0hBIFJBTzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALXfoa66VZ4dgA1wrJK62ormN9ESDXUJSZgjOdZ5386j1crGCXuPzsJXAc7lEwPmV4297XvdoNNhSs5YGBKSOYC5mGxqMhBqvRgkmKmNOPKS8/rLy+e6NPcADEQCwEZOxkW566rOpJo0dQCZFlH9KuU0bODqIj0UkRhu95fbRP3lq3CZ9jPZxs6iklHd/7ob2+3F//y1xJRiHabXDHoJRPIAejJUR8BbLJGxzVC/rrKjXhtAStugKhmuxkMG0C4f7UEEiiky3yXGBhEiRJGHegc/MLwq2QMIpOlxlHABctYGZF/T6TWUiGBS2GVgkA78eT7aw2mppaNqt3ynatQ/xxsCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAJ1Vnv5oO5S52EdijS/oLKriHfQr+/lmwbHOC9J0hMfcCb3jtoEpUfjQlzTpJgpFDujbIM2X/nY99qhOVRX7kW5opUIeIJcMFdt+RUPQHogn8yo7OZW2bnbTewNhpRtbLxZ1Pi8ZV/psBy4JUpQT6cRMmNJO+PE/yBPpjl1WvooH3DukJx5AwlPCuD64Dp+QP8cqxB7PrrHc26ZwSsgako49n5PP+sTJRmCt5FetMj35mJF7tdxjtJ5bQ++QBaQHFqdj8OLqF4hQoGlPNrBl+5paDo3u2gjEsh21Yd04Ij18Nf36SvWKDNd2MOLtMEUm7XbRBBc2DjQUgwp0eJAWRgA==";

const closed: Record<string, unknown>[] = [];
const enrolled: Record<string, unknown>[] = [];
let job: Record<string, unknown> | null = null;

mock.module("@pi-dash/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [{ name: "Asha", role: "admin" }] }),
      }),
    }),
  },
}));
mock.module("@pi-dash/db/schema/auth", () => ({ user: {} }));
mock.module("@pi-dash/db/queries/signing", () => ({
  closeJob: async (id: string, outcome: Record<string, unknown>) => {
    closed.push({ id, ...outcome });
    return true;
  },
  enrolCertificate: async (
    trusteeId: string,
    facts: Record<string, unknown>
  ) => {
    enrolled.push({ trusteeId, ...facts });
    return "cert-1";
  },
  getCertificate: async () => null,
  openJobForToken: async () => job,
}));
mock.module("@pi-dash/db/queries/governance", () => ({
  trusteeNamesForMatching: async () => [
    { id: "asha", names: ["Asha Rao"] },
    { id: "vikram", names: ["Vikram Menon"] },
  ],
}));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  getResolution: async () => ({ title: "Operation of bank accounts" }),
}));
mock.module("../audit", () => ({
  runAuditedAction: async (_options: unknown, run: () => Promise<unknown>) =>
    await run(),
}));
mock.module("../s3", () => ({ getS3: async () => ({}) }));
mock.module("./accept-signature", () => ({
  acceptSignedPdf: async () => ({}),
}));
mock.module("./signing-service", () => ({
  finishRemoteSignature: async () => new Uint8Array(),
  SigningServiceError: class SigningServiceError extends Error {},
}));

const { certificateFacts, completeJob, describeJob } =
  await import("./signing-jobs");

const IN_VALIDITY = new Date("2027-01-01T00:00:00Z");

describe("certificateFacts", () => {
  it("reads the name, issuer, validity and fingerprint", () => {
    const facts = certificateFacts(ASHA_CERT, ["ca"], IN_VALIDITY);
    expect(facts?.commonName).toBe("ASHA RAO");
    expect(facts?.issuer).toBe("Test CCA Root");
    expect(facts?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(facts?.chain).toEqual(["ca"]);
  });

  it("refuses an expired or unreadable certificate", () => {
    expect(
      certificateFacts(ASHA_CERT, [], new Date("2100-06-01T00:00:00Z"))
    ).toBeNull();
    expect(certificateFacts("bm90IGEgY2VydA==", [])).toBeNull();
  });
});

describe("helper jobs", () => {
  beforeEach(() => {
    closed.length = 0;
    enrolled.length = 0;
    job = {
      id: "job-1",
      kind: "enrol",
      legalName: "Asha Rao",
      trusteeId: "asha",
      userId: "user-1",
    };
  });

  it("answers a used or expired link with 404", async () => {
    job = null;
    expect((await describeJob("t".repeat(43))).status).toBe(404);
    expect((await completeJob("t".repeat(43), {})).status).toBe(404);
  });

  it("describes an enrolment without anything to sign", async () => {
    const reply = await describeJob("t".repeat(43));
    expect(reply).toEqual({
      body: { kind: "enrol", signer: "Asha Rao", title: "DSC enrolment" },
      status: 200,
    });
  });

  it("enrols the certificate in the trustee's name", async () => {
    const reply = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
      chain: ["ca"],
    });
    expect(reply.status).toBe(200);
    expect(enrolled).toEqual([
      expect.objectContaining({ subject: "ASHA RAO", trusteeId: "asha" }),
    ]);
    expect(closed).toEqual([{ id: "job-1", ok: true }]);
  });

  it("refuses a token holding someone else's certificate", async () => {
    job = { ...job, legalName: "Vikram Menon", trusteeId: "vikram" };
    const reply = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
    });
    expect(reply.status).toBe(422);
    expect(String(reply.body.message)).toContain("Vikram Menon");
    expect(enrolled).toEqual([]);
    expect(closed[0]).toMatchObject({ id: "job-1" });
  });
});
