import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import { createHash } from "node:crypto";

import { createMemoryAdapter } from "@signr/server";

/** A throwaway test certificate: CN=ASHA RAO, from a test CA, RSA, 2026 to 2099. */
const ASHA_CERT =
  "MIIC0zCCAbugAwIBAgIUMkaHVPEYKxtKDDFN2U7Ypz7TzfswDQYJKoZIhvcNAQELBQAwJTELMAkGA1UEBhMCSU4xFjAUBgNVBAMMDVRlc3QgQ0NBIFJvb3QwIBcNMjYwMTAxMDAwMDAwWhgPMjA5OTEyMzEwMDAwMDBaMCAxCzAJBgNVBAYTAklOMREwDwYDVQQDDAhBU0hBIFJBTzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALXfoa66VZ4dgA1wrJK62ormN9ESDXUJSZgjOdZ5386j1crGCXuPzsJXAc7lEwPmV4297XvdoNNhSs5YGBKSOYC5mGxqMhBqvRgkmKmNOPKS8/rLy+e6NPcADEQCwEZOxkW566rOpJo0dQCZFlH9KuU0bODqIj0UkRhu95fbRP3lq3CZ9jPZxs6iklHd/7ob2+3F//y1xJRiHabXDHoJRPIAejJUR8BbLJGxzVC/rrKjXhtAStugKhmuxkMG0C4f7UEEiiky3yXGBhEiRJGHegc/MLwq2QMIpOlxlHABctYGZF/T6TWUiGBS2GVgkA78eT7aw2mppaNqt3ynatQ/xxsCAwEAATANBgkqhkiG9w0BAQsFAAOCAQEAJ1Vnv5oO5S52EdijS/oLKriHfQr+/lmwbHOC9J0hMfcCb3jtoEpUfjQlzTpJgpFDujbIM2X/nY99qhOVRX7kW5opUIeIJcMFdt+RUPQHogn8yo7OZW2bnbTewNhpRtbLxZ1Pi8ZV/psBy4JUpQT6cRMmNJO+PE/yBPpjl1WvooH3DukJx5AwlPCuD64Dp+QP8cqxB7PrrHc26ZwSsgako49n5PP+sTJRmCt5FetMj35mJF7tdxjtJ5bQ++QBaQHFqdj8OLqF4hQoGlPNrBl+5paDo3u2gjEsh21Yd04Ij18Nf36SvWKDNd2MOLtMEUm7XbRBBc2DjQUgwp0eJAWRgA==";

/** Self-signed CN=ASHA RAO certificates on other keys, 2026 to 2100. */
const P256_CERT =
  "MIIBdjCCARygAwIBAgIUFs05FpN7C6WVanyPZnBm2zEodjMwCgYIKoZIzj0EAwIwIDELMAkGA1UEBhMCSU4xETAPBgNVBAMMCEFTSEEgUkFPMCAXDTI2MTAyMjExNTQ0NFoYDzIxMDAwOTI0MTE1NDQ0WjAgMQswCQYDVQQGEwJJTjERMA8GA1UEAwwIQVNIQSBSQU8wWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAS+fuVNARDcz0NW+74/1LgLpKsLKoJm8/VtPXdPon5Xmnx8TIPJcLvgg/5vrBWUXp1NiLDXzrV2f5Ve57wn0MLKozIwMDAdBgNVHQ4EFgQUolEPN/1ZpNO20ApmqX1N+OOQ9MYwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiAx1gVa5x/uN16Lnscgn/LXD0SHGBwsQ1z6/q+xytAUwAIhAKiAOB8bkaH4Yfze7fvhYU8tCoiXvprUoYINGvOsGtIm";
const P384_CERT =
  "MIIBsjCCATmgAwIBAgIUcH48Lgpz9V/pr5sUJ2J2jb5fLF8wCgYIKoZIzj0EAwIwIDELMAkGA1UEBhMCSU4xETAPBgNVBAMMCEFTSEEgUkFPMCAXDTI2MTAyMjExNTQ0NFoYDzIxMDAwOTI0MTE1NDQ0WjAgMQswCQYDVQQGEwJJTjERMA8GA1UEAwwIQVNIQSBSQU8wdjAQBgcqhkjOPQIBBgUrgQQAIgNiAASQDm9afP6QPAEO2YssT4kYbOXz3aVgSAorkO97PrBG4wCsVrLtYxRie8rNjX38Pas02/YBxIskkLO0UbZPNMPQ3DXBsIbX7GEmhYA6n1UEdZGwhUevp/xX6QyieQSR7MOjMjAwMB0GA1UdDgQWBBTfKyt1jet2Vy6HqqgzCcDTqaoIATAPBgNVHRMBAf8EBTADAQH/MAoGCCqGSM49BAMCA2cAMGQCMFfZBTqnY/5P81olmLEKWwsgfLfJiPgYeflQs9v64K7NV2+Yvnkj7Bi85Wkke44zEQIwdJxM65EP/Y040r+XLVk3vgG+3jd6n0EF2qvEWDzDKBzB+fz/B7qby2C2zBxQ8J/E";
const SECP256K1_CERT =
  "MIIBczCCARmgAwIBAgIUUBI1ik415wbKJmBN7gCbmUWbXNkwCgYIKoZIzj0EAwIwIDELMAkGA1UEBhMCSU4xETAPBgNVBAMMCEFTSEEgUkFPMCAXDTI2MTAyMjExNTQ0NFoYDzIxMDAwOTI0MTE1NDQ0WjAgMQswCQYDVQQGEwJJTjERMA8GA1UEAwwIQVNIQSBSQU8wVjAQBgcqhkjOPQIBBgUrgQQACgNCAASaZTVU8t6Ul23Nmz3NXiVe8vMpFVhGhGIovaA39XovVy7gMfAq/trFIpwJfVMiZi26C2Ll8gBlpDRzyqfc2T4hozIwMDAdBgNVHQ4EFgQUPfbr8zeIIHm4h+0y7WkXh/llE3EwDwYDVR0TAQH/BAUwAwEB/zAKBggqhkjOPQQDAgNIADBFAiAU0/iUPSBDNleNKdESLBfSGSL7ggeqbr6BJldAnZtqhgIhALQ8UsJntMonxBHtdlUIqa/fwcsMhxKZjurg39GdKwMQ";
const ED25519_CERT =
  "MIIBNTCB6KADAgECAhR7lccdpdsVDheQAFxKbcYqOyitWjAFBgMrZXAwIDELMAkGA1UEBhMCSU4xETAPBgNVBAMMCEFTSEEgUkFPMCAXDTI2MTAyMjExNTQ0NFoYDzIxMDAwOTI0MTE1NDQ0WjAgMQswCQYDVQQGEwJJTjERMA8GA1UEAwwIQVNIQSBSQU8wKjAFBgMrZXADIQBLoxaUNNWIV4dIfr7Jgh9IHoe2mztf/dSiI5mSA8vd0aMyMDAwHQYDVR0OBBYEFAGDMWn0Cs8+NIprH4iMvQF0mMGVMA8GA1UdEwEB/wQFMAMBAf8wBQYDK2VwA0EAJ8A2sxk0X7ufT9rxt4XRNPqt3P8aIknvuvn5wkTtqjX20ygNPcGl+lspA4Mzu7QZkcL4U1Lr9aUkyfVIr1ydDg==";

const ORIGIN = "https://dash.example.org";
const HELPER_VERSION = "0.1.0";
const PDF = new TextEncoder().encode("%PDF-1.7 prepared");
const SIGNED = new TextEncoder().encode("%PDF-1.7 signed");
const ASHA_SHA256 = createHash("sha256")
  .update(Buffer.from(ASHA_CERT, "base64"))
  .digest("hex");

/** Job rows in memory, through signr's own reference adapter. */
const store = createMemoryAdapter({ onCompleted: async () => undefined });
const objects = new Map<string, Uint8Array>();
const audited: Record<string, unknown>[] = [];
const enrolled: Record<string, unknown>[] = [];
const accepted: Record<string, unknown>[] = [];
const serviceCalls: { body: Record<string, unknown>; path: string }[] = [];
let trusted = true;
let rateLimited = false;
let recordedMeanwhile = false;
let accept: () => Promise<unknown> = async () => [];
let certificate: Record<string, unknown> | null = null;
let meeting: Record<string, unknown> | null = null;
let declaration: Record<string, unknown> | null = null;

const testEnv: Record<string, string> = {
  APP_URL: `${ORIGIN}/`,
  R2_KEY_PREFIX: "test",
  SIGNING_SERVICE_TOKEN: "test-signing-token-0123456789abcdef",
  SIGNING_SERVICE_URL: "http://signing.test",
};
mock.module("@pi-dash/env/server", () => ({ env: testEnv }));
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
  currentCertificate: async () => certificate,
  enrolCertificate: async (
    trusteeId: string,
    facts: Record<string, unknown>
  ) => {
    enrolled.push({ trusteeId, ...facts });
    return "cert-1";
  },
  expireSigningJobs: store.expireOlderThan,
  getSigningJob: store.get,
  insertSigningJob: store.create,
  signatureRecordedSince: async () => recordedMeanwhile,
  transitionSigningJob: store.transition,
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
class CertificateError extends Error {}
mock.module("@pi-dash/db/queries/utilisation-certificates", () => ({
  CertificateError,
  getCertificate: async () => null,
}));
mock.module("../grants/utilisation-certificates", () => ({
  acceptSignedCertificate: async (input: Record<string, unknown>) => {
    accepted.push({ kind: "utilisation_certificate", ...input });
    await accept();
    return "awaiting_finance";
  },
}));
/** Records each audited action with its outcome, as the audit log would. */
mock.module("../audit", () => ({
  runAuditedAction: async (
    options: Record<string, unknown>,
    run: () => Promise<unknown>,
    classify?: (result: unknown) => string
  ) => {
    const entry: Record<string, unknown> = { ...options };
    audited.push(entry);
    try {
      const result = await run();
      entry.outcome = classify?.(result) ?? "success";
      return result;
    } catch (error) {
      entry.outcome = "failure";
      throw error;
    }
  },
}));
mock.module("../rate-limit", () => ({
  checkRateLimit: () => ({ allowed: !rateLimited }),
}));
mock.module("../s3", () => ({
  getS3: () => ({
    delete: async (key: string) => {
      objects.delete(key);
    },
    file: (key: string) => ({
      arrayBuffer: async () => objects.get(key)?.slice().buffer,
      exists: async () => objects.has(key),
    }),
    write: async (key: string, bytes: Uint8Array) => {
      objects.set(key, bytes.slice());
    },
  }),
}));
mock.module("./accept-signature", () => ({
  acceptSignedDeclaration: async (input: Record<string, unknown>) => {
    accepted.push({ kind: "declaration", ...input });
    await accept();
  },
  acceptSignedMinutes: async (input: Record<string, unknown>) => {
    accepted.push({ kind: "minutes", ...input });
    await accept();
  },
  acceptSignedPdf: async (input: Record<string, unknown>) => {
    accepted.push({ kind: "circular", ...input });
    await accept();
  },
}));
mock.module("./signing-service", () => ({
  SigningServiceError: class SigningServiceError extends Error {},
}));

/** The signing service, as `@signr/server` calls it. */
globalThis.fetch = (async (input: URL, init: RequestInit) => {
  const body = JSON.parse(String(init.body)) as Record<string, unknown>;
  serviceCalls.push({ body, path: input.pathname });
  if (input.pathname === "/certificate") {
    return Response.json({ trusted });
  }
  if (input.pathname === "/sign/start") {
    return Response.json({
      digestAlgorithm: "sha256",
      signatureAlgorithm: "rsa-pkcs1-v1_5",
      state: JSON.stringify({ output: Buffer.from(PDF).toString("base64") }),
      toSign: "dG8tc2lnbg==",
    });
  }
  return new Response(SIGNED);
}) as typeof fetch;

const { CircularError } = await import("./circulars");
const {
  jobStatusFor,
  signrJobs,
  startDeclarationJob,
  startEnrolJob,
  startMinutesJob,
  startSignJob,
} = await import("./signing-jobs");

const ASHA = { trustee: { id: "asha", legalName: "Asha Rao" }, userId: "u1" };

/** What the helper sends: a GET claims the job, a POST names its action. */
async function helper(
  token: string,
  action?: "certificate" | "failure" | "signature",
  body?: Record<string, unknown>,
  version = HELPER_VERSION
): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await signrJobs().handle(
    new Request(
      `${ORIGIN}/api/signing/v1/jobs/${token}${action ? `/${action}` : ""}`,
      {
        headers: { "X-Signr-Version": version },
        ...(action ? { body: JSON.stringify(body), method: "POST" } : {}),
      }
    )
  );
  return {
    body: (await response.json()) as Record<string, unknown>,
    status: response.status,
  };
}

async function claim(token: string): Promise<string> {
  const reply = await helper(token);
  expect(reply.status).toBe(200);
  return String(reply.body.claimNonce);
}

async function enrolWith(der: string, chain: string[] = []) {
  const { token } = await startEnrolJob(ASHA);
  const claimNonce = await claim(token);
  const reply = await helper(token, "certificate", {
    certificate: der,
    chain,
    claimNonce,
  });
  return { reply, token };
}

async function signCircular(circularId = "circular-1") {
  const { token } = await startSignJob({
    ...ASHA,
    fieldName: "sig_asha",
    pdf: PDF,
    target: { id: circularId, type: "circular" },
    title: "Operation of bank accounts",
  });
  const claimNonce = await claim(token);
  const prepared = await helper(token, "certificate", {
    certificate: ASHA_CERT,
    chain: [],
    claimNonce,
  });
  expect(prepared.status).toBe(200);
  const signed = await helper(token, "signature", {
    claimNonce,
    signature: "c2lnbmF0dXJl",
  });
  return { claimNonce, signed, token };
}

beforeEach(() => {
  objects.clear();
  audited.length = 0;
  enrolled.length = 0;
  accepted.length = 0;
  serviceCalls.length = 0;
  trusted = true;
  rateLimited = false;
  recordedMeanwhile = false;
  accept = async () => [];
  certificate = { sha256: ASHA_SHA256 };
  meeting = null;
  declaration = null;
});

describe("the job endpoint", () => {
  it("serves signr links on the dashboard's origin under /api/signing", async () => {
    const { link, token } = await startEnrolJob(ASHA);
    expect(link).toBe(
      `signr://enrol?job=${encodeURIComponent(`${ORIGIN}/api/signing/v1/jobs/${token}`)}`
    );
    const reply = await helper(token);
    expect(reply.body).toMatchObject({
      kind: "enrol",
      signer: "Asha Rao",
      title: "DSC enrolment",
    });
  });

  it("serves the manifest", async () => {
    expect(await signrJobs().manifest().json()).toMatchObject({
      name: "Proud Indian",
      protocol: 1,
    });
  });

  it("answers an unknown link with 404 and a finished one with 410", async () => {
    expect((await helper("t".repeat(43))).status).toBe(404);
    const { token } = await enrolWith(ASHA_CERT);
    expect((await helper(token)).status).toBe(410);
  });

  it("refuses a helper older than the dashboard serves and fails its job", async () => {
    const { token } = await startEnrolJob(ASHA);
    const reply = await helper(token, undefined, undefined, "0.0.9");
    expect(reply.status).toBe(426);
    expect(await jobStatusFor(token, "u1")).toEqual({
      message: "Update the signing helper, then try again.",
      state: "failed",
    });
  });

  it("shows a job's status only to the person who started it", async () => {
    const { token } = await startEnrolJob(ASHA);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "pending" });
    expect(await jobStatusFor(token, "someone-else")).toBeNull();
  });

  it("fails the job with the reason the helper gave up", async () => {
    const { token } = await startEnrolJob(ASHA);
    const claimNonce = await claim(token);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "claimed" });
    await helper(token, "failure", {
      claimNonce,
      message: "No DSC token is plugged in.",
    });
    expect(await jobStatusFor(token, "u1")).toEqual({
      message: "No DSC token is plugged in.",
      state: "failed",
    });
    expect(audited).toEqual([
      expect.objectContaining({
        action: "signing.enrol",
        actor: expect.objectContaining({ userId: "u1" }),
        metadata: {
          jobId: expect.stringMatching(/^[0-9a-f]{64}$/),
          method: "dsc_helper",
          reportedBy: "helper",
        },
        outcome: "failure",
        target: { id: "asha", type: "trustee" },
      }),
    ]);
  });

  it("answers 429 once the rate limit is reached", async () => {
    const { token } = await startEnrolJob(ASHA);
    rateLimited = true;
    expect((await helper(token)).status).toBe(429);
  });

  it("expires a stale job and deletes its PDF", async () => {
    const { token } = await startSignJob({
      ...ASHA,
      fieldName: "sig_asha",
      pdf: PDF,
      target: { id: "circular-1", type: "circular" },
      title: "Operation of bank accounts",
    });
    expect(objects.size).toBe(1);
    // Starting a job sweeps the ones past their 15 minutes.
    setSystemTime(new Date(Date.now() + 60 * 60_000));
    try {
      await startEnrolJob(ASHA);
      expect(objects.size).toBe(0);
      expect((await jobStatusFor(token, "u1"))?.state).toBe("expired");
    } finally {
      setSystemTime();
    }
  });

  it("refuses an http://localhost origin in production", async () => {
    const saved = { ...testEnv };
    Object.assign(testEnv, {
      APP_URL: "http://localhost:3001",
      NODE_ENV: "production",
    });
    try {
      // A fresh copy of the module, which reads NODE_ENV when it loads.
      const specifier = "./signing-jobs?production";
      const fresh = (await import(specifier)) as { signrJobs: () => unknown };
      expect(() => fresh.signrJobs()).toThrow(
        "origin must be a bare https origin"
      );
    } finally {
      delete testEnv.NODE_ENV;
      Object.assign(testEnv, saved);
    }
  });
});

describe("enrolment", () => {
  it("enrols the certificate in the trustee's name", async () => {
    const { reply, token } = await enrolWith(ASHA_CERT, [P256_CERT]);
    expect(reply.status).toBe(200);
    expect(enrolled).toEqual([
      expect.objectContaining({
        chain: [P256_CERT],
        der: ASHA_CERT,
        issuer: "Test CCA Root",
        notAfter: new Date("2099-12-31T00:00:00Z"),
        serial: expect.stringMatching(/^[0-9A-F]+$/),
        sha256: ASHA_SHA256,
        subject: "ASHA RAO",
        trusteeId: "asha",
      }),
    ]);
    expect(audited).toEqual([
      expect.objectContaining({
        action: "signing.enrol",
        actor: expect.objectContaining({ userId: "u1" }),
        target: { id: "asha", type: "trustee" },
      }),
    ]);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "completed" });
  });

  it("takes an EC key on P-256 or P-384", async () => {
    for (const der of [P256_CERT, P384_CERT]) {
      expect((await enrolWith(der)).reply.status).toBe(200);
    }
    expect(enrolled).toHaveLength(2);
  });

  it("refuses an unreadable certificate or a key on another curve or algorithm", async () => {
    for (const der of ["bm90IGEgY2VydA==", SECP256K1_CERT, ED25519_CERT]) {
      const { reply, token } = await enrolWith(der);
      expect(reply.status).toBe(422);
      expect((await jobStatusFor(token, "u1"))?.state).toBe("failed");
    }
    expect(enrolled).toEqual([]);
  });

  it("refuses a token holding someone else's certificate", async () => {
    const { token } = await startEnrolJob({
      trustee: { id: "vikram", legalName: "Vikram Menon" },
      userId: "u2",
    });
    const claimNonce = await claim(token);
    const reply = await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    expect(reply.status).toBe(422);
    expect(String(reply.body.message)).toContain("Vikram Menon");
    expect(enrolled).toEqual([]);
    expect(await jobStatusFor(token, "u2")).toEqual({
      message: String(reply.body.message),
      state: "failed",
    });
  });

  it("refuses a certificate no licensed CA issued", async () => {
    trusted = false;
    const { reply, token } = await enrolWith(ASHA_CERT);
    expect(reply.status).toBe(422);
    expect(enrolled).toEqual([]);
    expect((await jobStatusFor(token, "u1"))?.state).toBe("failed");
    expect(audited).toEqual([
      expect.objectContaining({
        action: "signing.enrol",
        actor: expect.objectContaining({ userId: "u1" }),
        metadata: {
          jobId: expect.stringMatching(/^[0-9a-f]{64}$/),
          method: "dsc_helper",
          reportedBy: "server",
        },
        outcome: "failure",
      }),
    ]);
  });
});

describe("circular jobs", () => {
  it("signs with the enrolled certificate and files the signed circular", async () => {
    const { signed, token } = await signCircular();
    expect(signed.status).toBe(200);
    expect(serviceCalls.find((c) => c.path === "/sign/start")?.body).toEqual(
      expect.objectContaining({
        fieldName: "sig_asha",
        pdf: Buffer.from(PDF).toString("base64"),
        stampStyle: "proud-indian",
      })
    );
    expect(accepted).toEqual([
      {
        circularId: "circular-1",
        expectedCertificateSha256: ASHA_SHA256,
        kind: "circular",
        method: "dsc_helper",
        trustee: { id: "asha", legalName: "Asha Rao" },
        uploaded: SIGNED,
        userId: "u1",
      },
    ]);
    expect(audited).toEqual([
      expect.objectContaining({
        action: "circular.sign",
        target: { id: "circular-1", type: "circular" },
      }),
    ]);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "completed" });
    // The PDF and the service's state lived in R2 only while the job was open.
    expect(objects.size).toBe(0);
  });

  it("keeps the PDF and state under the signing jobs prefix", async () => {
    const { token } = await startSignJob({
      ...ASHA,
      fieldName: "sig_asha",
      pdf: PDF,
      target: { id: "circular-1", type: "circular" },
      title: "Operation of bank accounts",
    });
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    expect([...objects.keys()]).toEqual([
      expect.stringMatching(
        /^test\/governance\/signing-jobs\/[0-9a-f]{64}\/state\//
      ),
    ]);
  });

  it("refuses another certificate than the enrolled one", async () => {
    certificate = { sha256: "a".repeat(64) };
    const { token } = await startSignJob({
      ...ASHA,
      fieldName: "sig_asha",
      pdf: PDF,
      target: { id: "circular-1", type: "circular" },
      title: "Operation of bank accounts",
    });
    const claimNonce = await claim(token);
    const reply = await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    expect(reply.status).toBe(422);
    expect(accepted).toEqual([]);
  });

  it("needs an enrolled certificate", async () => {
    certificate = null;
    await expect(
      startSignJob({
        ...ASHA,
        fieldName: "sig_asha",
        pdf: PDF,
        target: { id: "circular-1", type: "circular" },
        title: "Operation of bank accounts",
      })
    ).rejects.toThrow("Set up your DSC first");
  });

  it("fails the job with the reason the circular refused the copy", async () => {
    accept = async () => {
      throw new CircularError("This copy is stale. Download it again.");
    };
    const { signed, token } = await signCircular();
    expect(signed.status).toBe(422);
    expect(signed.body.message).toBe("This copy is stale. Download it again.");
    expect(await jobStatusFor(token, "u1")).toEqual({
      message: "This copy is stale. Download it again.",
      state: "failed",
    });
    // The completion attempt, then the job failing with the refusal, tied by jobId.
    const jobId = expect.stringMatching(/^[0-9a-f]{64}$/);
    expect(audited).toEqual([
      expect.objectContaining({
        action: "circular.sign",
        metadata: { jobId, method: "dsc_helper" },
        outcome: "failure",
      }),
      expect.objectContaining({
        action: "circular.sign",
        metadata: { jobId, method: "dsc_helper", reportedBy: "server" },
        outcome: "failure",
        target: { id: "circular-1", type: "circular" },
      }),
    ]);
    const [attempt, failure] = audited.map(
      (row) => (row.metadata as { jobId: string }).jobId
    );
    expect(attempt).toBe(failure);
    // The refusal is free text: it stays on the job, out of the audit log.
    expect(JSON.stringify(audited)).not.toContain("stale");
  });

  it("leaves the job prepared when filing fails for another reason, for a retry", async () => {
    let failures = 1;
    accept = async () => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("R2 write failed");
      }
    };
    const { claimNonce, signed, token } = await signCircular();
    expect(signed.status).toBe(500);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "prepared" });
    expect(audited).toEqual([
      expect.objectContaining({ action: "circular.sign", outcome: "failure" }),
    ]);
    const retried = await helper(token, "signature", {
      claimNonce,
      signature: "c2lnbmF0dXJl",
    });
    expect(retried.status).toBe(200);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "completed" });
    expect(audited[1]).toMatchObject({
      action: "circular.sign",
      outcome: "success",
    });
  });

  it("settles as signed when a lapsed completion recorded the signature", async () => {
    accept = async () => {
      throw new CircularError("This copy is stale. Download it again.");
    };
    recordedMeanwhile = true;
    const { signed, token } = await signCircular();
    expect(signed.status).toBe(200);
    expect(await jobStatusFor(token, "u1")).toEqual({ state: "completed" });
  });
});

describe("minutes jobs", () => {
  beforeEach(() => {
    meeting = {
      chairTrusteeId: "asha",
      id: "meeting-1",
      minutesDocumentId: null,
      minutesObjectKey: "minutes.pdf",
      startsAt: new Date("2026-10-19T04:30:00Z"),
      status: "held",
    };
    objects.set("minutes.pdf", PDF);
  });

  it("starts a job on the current minutes for the chair", async () => {
    const { token } = await startMinutesJob({
      ...ASHA,
      meetingId: "meeting-1",
    });
    expect((await helper(token)).body).toMatchObject({
      kind: "sign",
      title: "Minutes of the board meeting of 19 October 2026",
    });
  });

  it("refuses a trustee who didn't chair the meeting", async () => {
    meeting = { ...meeting, chairTrusteeId: "vikram" };
    await expect(
      startMinutesJob({ ...ASHA, meetingId: "meeting-1" })
    ).rejects.toThrow("Only the chair of the meeting signs its minutes.");
  });

  it("refuses minutes already signed", async () => {
    meeting = { ...meeting, minutesDocumentId: "document-1" };
    await expect(
      startMinutesJob({ ...ASHA, meetingId: "meeting-1" })
    ).rejects.toThrow("The minutes are already signed.");
  });

  it("files the signed minutes through the minutes acceptance", async () => {
    const { token } = await startMinutesJob({
      ...ASHA,
      meetingId: "meeting-1",
    });
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    const signed = await helper(token, "signature", {
      claimNonce,
      signature: "c2lnbmF0dXJl",
    });
    expect(signed.status).toBe(200);
    expect(accepted).toEqual([
      {
        expectedCertificateSha256: ASHA_SHA256,
        kind: "minutes",
        meetingId: "meeting-1",
        uploaded: SIGNED,
        userId: "u1",
      },
    ]);
    expect(audited[0]).toMatchObject({
      action: "meeting.sign_minutes",
      target: { id: "meeting-1", type: "meeting" },
    });
  });
});

describe("declaration jobs", () => {
  beforeEach(() => {
    declaration = {
      fiscalYear: "2026-27",
      id: "declaration-1",
      objectKey: "declaration.pdf",
      status: "awaiting_signature",
      trusteeId: "asha",
    };
    objects.set("declaration.pdf", PDF);
  });

  it("starts a job on the declaration waiting for its trustee's signature", async () => {
    const { token } = await startDeclarationJob({
      ...ASHA,
      declarationId: "declaration-1",
    });
    expect((await helper(token)).body).toMatchObject({
      kind: "sign",
      title: "Declaration of interests for 2026-27",
    });
  });

  it("refuses another trustee", async () => {
    declaration = { ...declaration, trusteeId: "vikram" };
    await expect(
      startDeclarationJob({ ...ASHA, declarationId: "declaration-1" })
    ).rejects.toThrow("Only the trustee who declared signs the declaration.");
  });

  it("refuses a declaration already signed", async () => {
    declaration = { ...declaration, status: "signed" };
    await expect(
      startDeclarationJob({ ...ASHA, declarationId: "declaration-1" })
    ).rejects.toThrow("This declaration is already signed.");
  });

  it("files the signed declaration through the declaration acceptance", async () => {
    const { token } = await startDeclarationJob({
      ...ASHA,
      declarationId: "declaration-1",
    });
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    const signed = await helper(token, "signature", {
      claimNonce,
      signature: "c2lnbmF0dXJl",
    });
    expect(signed.status).toBe(200);
    expect(accepted).toEqual([
      {
        declarationId: "declaration-1",
        expectedCertificateSha256: ASHA_SHA256,
        kind: "declaration",
        uploaded: SIGNED,
        userId: "u1",
      },
    ]);
    expect(audited[0]).toMatchObject({
      action: "governance.sign_declaration",
      target: { id: "declaration-1", type: "conflict_declaration" },
    });
  });
});

describe("utilisation certificate jobs", () => {
  async function signCertificate() {
    const { token } = await startSignJob({
      ...ASHA,
      fieldName: "sig_asha",
      pdf: PDF,
      target: { id: "uc-1", type: "utilisation_certificate" },
      title: "Utilisation certificate UC-1: School kits",
    });
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    const signed = await helper(token, "signature", {
      claimNonce,
      signature: "c2lnbmF0dXJl",
    });
    return { signed, token };
  }

  it("files the signed certificate through the certificate acceptance", async () => {
    const { signed } = await signCertificate();
    expect(signed.status).toBe(200);
    expect(accepted).toEqual([
      {
        certificateId: "uc-1",
        expectedCertificateSha256: ASHA_SHA256,
        kind: "utilisation_certificate",
        trusteeId: "asha",
        uploaded: SIGNED,
      },
    ]);
    expect(audited[0]).toMatchObject({
      action: "utilisation_certificate.sign",
      target: { id: "uc-1", type: "utilisation_certificate" },
    });
  });

  it("fails the job with the reason the certificate refused the copy", async () => {
    accept = async () => {
      throw new CertificateError("It's the Chief Finance Officer's turn.");
    };
    const { signed, token } = await signCertificate();
    expect(signed.status).toBe(422);
    expect(await jobStatusFor(token, "u1")).toEqual({
      message: "It's the Chief Finance Officer's turn.",
      state: "failed",
    });
  });
});
