import { beforeEach, describe, expect, it, mock } from "bun:test";

/** A throwaway test certificate: CN=ASHA RAO, from a test CA, RSA, 2026 to 2099. */
const ASHA_CERT =
  "MIIC0zCCAbugAwIBAgIUMkaHVPEYKxtKDDFN2U7Ypz7TzfswDQYJKoZIhvcNAQELBQAwJTELMAkGA1UEBhMCSU4xFjAUBgNVBAMMDVRlc3QgQ0NBIFJvb3QwIBcNMjYwMTAxMDAwMDAwWhgPMjA5OTEyMzEwMDAwMDBaMCAxCzAJBgNVBAYTAklOMREwDwYDVQQDDAhBU0hBIFJBTzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALXfoa66VZ4dgA1wrJK62ormN9ESDXUJSZgjOdZ5386j1crGCXuPzsJXAc7lEwPmV4297XvdoNNhSs5YGBKSOYC5mGxqMhBqvRgkmKmNOPKS8/rLy+e6NPcADEQCwEZOxkW566rOpJo0dQCZFlH9KuU0bODqIj0UkRhu95fbRP3lq3CZ9jPZxs6iklHd/7ob2+3F//y1xJRiHabXDHoJRPIAejJUR8BbLJGxzVC/rrKjXhtAStugKhmuxkMG0C4f7UEEiiky3yXGBhEiRJGHegc/MLwq2QMIpOlxlHABctYGZF/T6TWUiGBS2GVgkA78eT7aw2mppaNqt3ynatQ/xxsCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAJ1Vnv5oO5S52EdijS/oLKriHfQr+/lmwbHOC9J0hMfcCb3jtoEpUfjQlzTpJgpFDujbIM2X/nY99qhOVRX7kW5opUIeIJcMFdt+RUPQHogn8yo7OZW2bnbTewNhpRtbLxZ1Pi8ZV/psBy4JUpQT6cRMmNJO+PE/yBPpjl1WvooH3DukJx5AwlPCuD64Dp+QP8cqxB7PrrHc26ZwSsgako49n5PP+sTJRmCt5FetMj35mJF7tdxjtJ5bQ++QBaQHFqdj8OLqF4hQoGlPNrBl+5paDo3u2gjEsh21Yd04Ij18Nf36SvWKDNd2MOLtMEUm7XbRBBc2DjQUgwp0eJAWRgA==";

const closed: Record<string, unknown>[] = [];
const enrolled: Record<string, unknown>[] = [];
let job: Record<string, unknown> | null = null;
let settled: { error: string | null; status: string } | null = null;
let trusted = true;
let claimTaken = false;
/** Whether a settle under this completion's claim finds the job still its own. */
let ownsClaim = true;
let recordedMeanwhile = false;
let certificate: Record<string, unknown> | null = null;
let accept: () => Promise<unknown[]> = async () => [];
const acceptedMinutes: Record<string, unknown>[] = [];
const created: Record<string, unknown>[] = [];
let meeting: Record<string, unknown> | null = null;
const acceptedDeclarations: Record<string, unknown>[] = [];
let declaration: Record<string, unknown> | null = null;
const acceptedCertificates: Record<string, unknown>[] = [];
let utilisationCertificate: Record<string, unknown> | null = null;
const CLAIM = new Date("2026-10-19T10:00:00Z");

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
  createSigningJob: async (input: Record<string, unknown>) => {
    created.push(input);
    return { id: "job-2", token: "token" };
  },
  currentCertificate: async () => certificate,
  closeJob: async (
    id: string,
    claim: Date,
    outcome: Record<string, unknown>
  ) => {
    if (!ownsClaim) {
      return false;
    }
    closed.push({ claim, id, ...outcome });
    return true;
  },
  enrolCertificate: async (
    trusteeId: string,
    facts: Record<string, unknown>
  ) => {
    enrolled.push({ trusteeId, ...facts });
    return "cert-1";
  },
  getCertificate: async () => certificate,
  jobOutcome: async () => settled ?? { error: null, status: "pending" },
  openJobForToken: async () => job,
  signatureRecordedSince: async () => recordedMeanwhile,
  whileClaimed: async (_id: string, work: (claim: Date) => unknown) =>
    claimTaken ? null : await work(CLAIM),
}));
mock.module("@pi-dash/db/queries/governance", () => ({
  trusteeNamesForMatching: async () => [
    { id: "asha", names: ["Asha Rao"] },
    { id: "vikram", names: ["Vikram Menon"] },
  ],
}));
mock.module("@pi-dash/db/queries/meetings", () => ({
  getMeeting: async () => meeting,
  MeetingError: class MeetingError extends Error {},
}));
mock.module("@pi-dash/db/queries/policies", () => ({
  DeclarationError: class DeclarationError extends Error {},
  getConflictDeclaration: async () => declaration,
}));
mock.module("@pi-dash/db/queries/resolutions", () => ({
  circularResolutions: async () => [{ title: "Operation of bank accounts" }],
}));
mock.module("@pi-dash/db/queries/utilisation-certificates", () => ({
  CertificateError: class CertificateError extends Error {},
  getCertificate: async () => utilisationCertificate,
}));
mock.module("../grants/utilisation-certificates", () => ({
  acceptSignedCertificate: async (input: Record<string, unknown>) => {
    acceptedCertificates.push(input);
    return "awaiting_finance";
  },
}));
mock.module("../audit", () => ({
  runAuditedAction: async (_options: unknown, run: () => Promise<unknown>) =>
    await run(),
}));
mock.module("../s3", () => ({
  getS3: async () => ({
    delete: async () => undefined,
    file: () => ({
      arrayBuffer: async () => new ArrayBuffer(8),
      text: async () => "state",
    }),
    write: async () => undefined,
  }),
}));
mock.module("./accept-signature", () => ({
  acceptSignedDeclaration: async (input: Record<string, unknown>) => {
    acceptedDeclarations.push(input);
    return "document-2";
  },
  acceptSignedMinutes: async (input: Record<string, unknown>) => {
    acceptedMinutes.push(input);
    return "document-1";
  },
  acceptSignedPdf: async () => await accept(),
  declarationKey: (trusteeId: string, name: string) => `${trusteeId}/${name}`,
  meetingKey: (meetingId: string, name: string) => `${meetingId}/${name}`,
  signedMessage: () => "Signed. Your signature is on the circular.",
}));
mock.module("./signing-service", () => ({
  certificateTrusted: async () => trusted,
  finishRemoteSignature: async () => new Uint8Array(),
  SigningServiceError: class SigningServiceError extends Error {},
  startRemoteSignature: async () => ({
    state: "state",
    toSign: "dG8tc2lnbg==",
  }),
}));

const {
  certificateFacts,
  completeJob,
  describeJob,
  OUTDATED_HELPER_MESSAGE,
  refuseOutdatedHelper,
  startDeclarationJob,
  startMinutesJob,
} = await import("./signing-jobs");

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
    settled = null;
    claimTaken = false;
    ownsClaim = true;
    recordedMeanwhile = false;
    certificate = null;
    accept = async () => [];
    acceptedMinutes.length = 0;
    created.length = 0;
    meeting = null;
    trusted = true;
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
    expect(closed).toEqual([{ claim: CLAIM, id: "job-1", ok: true }]);
  });

  it("closes the job with the reason the helper gave up", async () => {
    const reply = await completeJob("t".repeat(43), {
      failed: "No DSC token is plugged in.",
    });
    expect(reply.status).toBe(200);
    expect(enrolled).toEqual([]);
    expect(closed).toEqual([
      { claim: CLAIM, error: "No DSC token is plugged in.", id: "job-1" },
    ]);
  });

  it("refuses a helper older than the dashboard serves and fails its job", async () => {
    for (const version of [null, "0.1.1", "nonsense"]) {
      closed.length = 0;
      const reply = await refuseOutdatedHelper("t".repeat(43), version);
      expect(reply).toEqual({
        body: { message: OUTDATED_HELPER_MESSAGE },
        status: 426,
      });
      expect(closed).toEqual([
        { claim: CLAIM, error: OUTDATED_HELPER_MESSAGE, id: "job-1" },
      ]);
    }
    for (const version of ["0.2.0", "0.10.0", "1.0.0"]) {
      expect(await refuseOutdatedHelper("t".repeat(43), version)).toBeNull();
    }
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

  it("answers a completion that lost the claim with how the job ended", async () => {
    claimTaken = true;
    const running = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
    });
    expect(running.status).toBe(409);
    settled = { error: null, status: "completed" };
    const done = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
    });
    expect(done.status).toBe(200);
    settled = {
      error: "The token signed with another certificate.",
      status: "failed",
    };
    const failed = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
    });
    expect(failed).toEqual({
      body: { message: "The token signed with another certificate." },
      status: 422,
    });
    expect(enrolled).toEqual([]);
    expect(closed).toEqual([]);
  });

  it("answers with the stored outcome once its claim was taken over", async () => {
    ownsClaim = false;
    settled = { error: "Someone else signed.", status: "failed" };
    const reply = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
    });
    expect(reply).toEqual({
      body: { message: "Someone else signed." },
      status: 422,
    });
    expect(closed).toEqual([]);
  });

  it("settles as signed when a lapsed completion recorded the signature", async () => {
    const sha256 = certificateFacts(ASHA_CERT, [])?.sha256;
    certificate = { id: "cert-1", sha256 };
    job = {
      ...job,
      certificateId: "cert-1",
      circularId: "circular-1",
      createdAt: new Date("2026-10-19T09:55:00Z"),
      kind: "sign",
      stateObjectKey: "state.json",
    };
    recordedMeanwhile = true;
    accept = async () => {
      const { CircularError } = await import("./circulars");
      throw new CircularError("There's nothing left for you to sign.");
    };
    const reply = await completeJob("t".repeat(43), {
      certificate: ASHA_CERT,
      signature: "c2ln",
    });
    expect(reply.status).toBe(200);
    expect(closed).toEqual([{ claim: CLAIM, id: "job-1", ok: true }]);
  });

  it("refuses a certificate no licensed CA issued", async () => {
    trusted = false;
    const reply = await completeJob("t".repeat(43), {
      certificates: [ASHA_CERT],
    });
    expect(reply.status).toBe(422);
    expect(String(reply.body.message)).toContain("licensed Indian");
    expect(enrolled).toEqual([]);
  });
});

describe("minutes jobs", () => {
  const sha256 = certificateFacts(ASHA_CERT, [])?.sha256;

  beforeEach(() => {
    closed.length = 0;
    acceptedMinutes.length = 0;
    created.length = 0;
    claimTaken = false;
    ownsClaim = true;
    settled = null;
    certificate = { chain: [], der: ASHA_CERT, id: "cert-1", sha256 };
    meeting = {
      chairTrusteeId: "asha",
      id: "meeting-1",
      minutesDocumentId: null,
      minutesObjectKey: "minutes.pdf",
      minutesSha256: "abc",
      startsAt: new Date("2026-10-10T05:00:00Z"),
      status: "held",
    };
    job = {
      certificateId: "cert-1",
      circularId: null,
      createdAt: new Date("2026-10-19T09:55:00Z"),
      id: "job-1",
      kind: "sign",
      legalName: "Asha Rao",
      meetingId: "meeting-1",
      stateObjectKey: "state.json",
      toSign: "dG8tc2lnbg==",
      trusteeId: "asha",
      userId: "user-1",
    };
  });

  it("starts a job on the current minutes for the chair", async () => {
    expect(
      await startMinutesJob({
        meetingId: "meeting-1",
        trusteeId: "asha",
        userId: "user-1",
      })
    ).toEqual({ id: "job-2", token: "token" });
    expect(created).toEqual([
      expect.objectContaining({
        basedOnSha256: "abc",
        certificateId: "cert-1",
        kind: "sign",
        meetingId: "meeting-1",
        stateObjectKey: expect.stringMatching(/^meeting-1\/sign-state-/),
        toSign: "dG8tc2lnbg==",
        trusteeId: "asha",
      }),
    ]);
  });

  it("refuses a trustee who didn't chair the meeting", async () => {
    await expect(
      startMinutesJob({
        meetingId: "meeting-1",
        trusteeId: "vikram",
        userId: "user-2",
      })
    ).rejects.toThrow("Only the chair of the meeting signs its minutes.");
    expect(created).toEqual([]);
  });

  it("refuses minutes already signed", async () => {
    meeting = { ...meeting, minutesDocumentId: "document-1" };
    await expect(
      startMinutesJob({
        meetingId: "meeting-1",
        trusteeId: "asha",
        userId: "user-1",
      })
    ).rejects.toThrow("The minutes are already signed.");
    expect(created).toEqual([]);
  });

  it("describes the minutes to sign", async () => {
    expect(await describeJob("t".repeat(43))).toEqual({
      body: {
        certificateSha256: sha256,
        kind: "sign",
        signer: "Asha Rao",
        title: "Minutes of the board meeting of 10 October 2026",
        toSign: "dG8tc2lnbg==",
      },
      status: 200,
    });
  });

  it("files the signed minutes through the minutes acceptance", async () => {
    const reply = await completeJob("t".repeat(43), {
      certificate: ASHA_CERT,
      signature: "c2ln",
    });
    expect(reply.status).toBe(200);
    expect(String(reply.body.message)).toContain("minutes");
    expect(acceptedMinutes).toEqual([
      expect.objectContaining({
        expectedCertificateSha256: sha256,
        meetingId: "meeting-1",
        userId: "user-1",
      }),
    ]);
    expect(closed).toEqual([{ claim: CLAIM, id: "job-1", ok: true }]);
  });

  it("closes the job with the reason the helper gave up", async () => {
    const reply = await completeJob("t".repeat(43), {
      failed: "The PIN was cancelled.",
    });
    expect(reply.status).toBe(200);
    expect(acceptedMinutes).toEqual([]);
    expect(closed).toEqual([
      { claim: CLAIM, error: "The PIN was cancelled.", id: "job-1" },
    ]);
  });
});

describe("declaration jobs", () => {
  const sha256 = certificateFacts(ASHA_CERT, [])?.sha256;

  beforeEach(() => {
    closed.length = 0;
    acceptedDeclarations.length = 0;
    created.length = 0;
    claimTaken = false;
    ownsClaim = true;
    settled = null;
    certificate = { chain: [], der: ASHA_CERT, id: "cert-1", sha256 };
    declaration = {
      fiscalYear: "2026-27",
      id: "declaration-1",
      objectKey: "declaration.pdf",
      sha256: "def",
      status: "awaiting_signature",
      trusteeId: "asha",
    };
    job = {
      certificateId: "cert-1",
      circularId: null,
      createdAt: new Date("2026-10-19T09:55:00Z"),
      declarationId: "declaration-1",
      id: "job-1",
      kind: "sign",
      legalName: "Asha Rao",
      meetingId: null,
      stateObjectKey: "state.json",
      toSign: "dG8tc2lnbg==",
      trusteeId: "asha",
      userId: "user-1",
    };
  });

  it("starts a job on the declaration waiting for its trustee's signature", async () => {
    expect(
      await startDeclarationJob({
        declarationId: "declaration-1",
        trusteeId: "asha",
        userId: "user-1",
      })
    ).toEqual({ id: "job-2", token: "token" });
    expect(created).toEqual([
      expect.objectContaining({
        basedOnSha256: "def",
        certificateId: "cert-1",
        declarationId: "declaration-1",
        kind: "sign",
        stateObjectKey: expect.stringMatching(/^asha\/sign-state-/),
        trusteeId: "asha",
      }),
    ]);
  });

  it("refuses another trustee", async () => {
    await expect(
      startDeclarationJob({
        declarationId: "declaration-1",
        trusteeId: "vikram",
        userId: "user-2",
      })
    ).rejects.toThrow("Only the trustee who declared signs the declaration.");
    expect(created).toEqual([]);
  });

  it("refuses a declaration already signed", async () => {
    declaration = { ...declaration, status: "signed" };
    await expect(
      startDeclarationJob({
        declarationId: "declaration-1",
        trusteeId: "asha",
        userId: "user-1",
      })
    ).rejects.toThrow("This declaration is already signed.");
    expect(created).toEqual([]);
  });

  it("describes the declaration to sign", async () => {
    expect(await describeJob("t".repeat(43))).toEqual({
      body: {
        certificateSha256: sha256,
        kind: "sign",
        signer: "Asha Rao",
        title: "Declaration of interests for 2026-27",
        toSign: "dG8tc2lnbg==",
      },
      status: 200,
    });
  });

  it("files the signed declaration through the declaration acceptance", async () => {
    const reply = await completeJob("t".repeat(43), {
      certificate: ASHA_CERT,
      signature: "c2ln",
    });
    expect(reply.status).toBe(200);
    expect(String(reply.body.message)).toContain("declaration");
    expect(acceptedDeclarations).toEqual([
      expect.objectContaining({
        declarationId: "declaration-1",
        expectedCertificateSha256: sha256,
        userId: "user-1",
      }),
    ]);
    expect(closed).toEqual([{ claim: CLAIM, id: "job-1", ok: true }]);
  });

  it("closes the job with the reason the helper gave up", async () => {
    const reply = await completeJob("t".repeat(43), {
      failed: "The PIN was cancelled.",
    });
    expect(reply.status).toBe(200);
    expect(acceptedDeclarations).toEqual([]);
    expect(closed).toEqual([
      { claim: CLAIM, error: "The PIN was cancelled.", id: "job-1" },
    ]);
  });
});

describe("utilisation certificate jobs", () => {
  const sha256 = certificateFacts(ASHA_CERT, [])?.sha256;

  beforeEach(() => {
    closed.length = 0;
    acceptedCertificates.length = 0;
    claimTaken = false;
    ownsClaim = true;
    settled = null;
    certificate = { chain: [], der: ASHA_CERT, id: "cert-1", sha256 };
    declaration = null;
    meeting = null;
    utilisationCertificate = {
      financeTrusteeId: "vikram",
      headSignedAt: null,
      headTrusteeId: "asha",
      number: "UC/2026-27/001",
      snapshot: { grant: { title: "Library corners" } },
    };
    job = {
      certificateId: "cert-1",
      circularId: null,
      createdAt: new Date("2026-10-19T09:55:00Z"),
      declarationId: null,
      id: "job-1",
      kind: "sign",
      legalName: "Asha Rao",
      meetingId: null,
      stateObjectKey: "state.json",
      toSign: "dG8tc2lnbg==",
      trusteeId: "asha",
      userId: "user-1",
      utilisationCertificateId: "uc-1",
    };
  });

  it("names the certificate and its grant to the helper", async () => {
    const reply = await describeJob("t".repeat(43));
    expect(reply.body.title).toBe(
      "Utilisation certificate UC/2026-27/001: Library corners"
    );
  });

  it("takes the signed copy through the certificate's acceptance", async () => {
    const reply = await completeJob("t".repeat(43), {
      certificate: ASHA_CERT,
      signature: "c2ln",
    });
    expect(reply.status).toBe(200);
    expect(String(reply.body.message)).toContain("utilisation certificate");
    expect(acceptedCertificates).toEqual([
      expect.objectContaining({
        certificateId: "uc-1",
        expectedCertificateSha256: sha256,
        trusteeId: "asha",
      }),
    ]);
    expect(closed).toEqual([{ claim: CLAIM, id: "job-1", ok: true }]);
  });
});
