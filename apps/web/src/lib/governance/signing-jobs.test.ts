import {
  beforeEach,
  describe,
  expect,
  it,
  mock,
  setSystemTime,
} from "bun:test";
import { createHash, createPrivateKey, sign } from "node:crypto";

import { createMemoryAdapter } from "@keyseal/server";

/** A throwaway self-signed test certificate: CN=ASHA RAO, RSA, 2026 to 2099. */
const ASHA_CERT =
  "MIIDDzCCAfegAwIBAgIUB4tKQa+wmzKudFAqofwXcyP9hTYwDQYJKoZIhvcNAQELBQAwIDELMAkGA1UEBhMCSU4xETAPBgNVBAMMCEFTSEEgUkFPMCAXDTI2MDEwMTAwMDAwMFoYDzIwOTkxMjMxMDAwMDAwWjAgMQswCQYDVQQGEwJJTjERMA8GA1UEAwwIQVNIQSBSQU8wggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDJBLiAKfELpRwlIHK4QiDjM5tc4f5p7xTeSg1geMDVeXP9Vus78jy7q/lJl3pLhf8K8Ni8feKVH/PY4cronQZDq7n+7nndFEm51coV5awXx7ueHADcODS+inbJFg231Bu/4h5kmqueyCcdhvoFTziiPlcBtBI3nEVue5NA7iv+aZlawiUqDf/bKHoWrY2lVCtW/jtK5KBn7qrQYsGH7tw6cQuX97ujaEaRkvGm5jVJTSbQqH26tdQkZZGz/l+A2uALn1HRtlYREC16ZwZbiq31rw9JeHvl6VT5EhUSNLHFn8mx4FKaye6SP6nJ31vU7CVhvSIlUn+TOE7jfeOLJehrAgMBAAGjPzA9MB0GA1UdDgQWBBT2aBaItub6npAf0EPM24XwZn+mAjAOBgNVHQ8BAf8EBAMCBsAwDAYDVR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOCAQEATZ+AoWF3vbp6RWKHE2xD67T61bsTRFEXs6TP9i7pLYSyP4r2Z77M2gJn4qyolf6ly5x7q9M1HZmv4T/u72wh2lQBcTfGmr4bTedxmaBl3yAgDmSXbylxiAHCzKQDfPLWX778AFaMrCF4IvYA+Nd08MdKkMUbX1gLbIfVjHteKXX47opnffYChDqB8lOk+2pUaBhofGbMiyZ8OMsa8O14ElQh3SsP1Eudoy9XbepAqA2KlrIyjYTq/yGd6o5k4+aP2L8dXVI4ylc7W0gQj2gwZsm0zr88k8CMfN71RIHQnrl5I5p0IIpCtC7lLateaQNRxnDOP/2fexo4uTdF9WSTwQ==";
/** ASHA_CERT's throwaway private key, so the helper's signatures verify. */
const ASHA_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDJBLiAKfELpRwl
IHK4QiDjM5tc4f5p7xTeSg1geMDVeXP9Vus78jy7q/lJl3pLhf8K8Ni8feKVH/PY
4cronQZDq7n+7nndFEm51coV5awXx7ueHADcODS+inbJFg231Bu/4h5kmqueyCcd
hvoFTziiPlcBtBI3nEVue5NA7iv+aZlawiUqDf/bKHoWrY2lVCtW/jtK5KBn7qrQ
YsGH7tw6cQuX97ujaEaRkvGm5jVJTSbQqH26tdQkZZGz/l+A2uALn1HRtlYREC16
ZwZbiq31rw9JeHvl6VT5EhUSNLHFn8mx4FKaye6SP6nJ31vU7CVhvSIlUn+TOE7j
feOLJehrAgMBAAECggEAQ2DYsuTcDeou7+bbbRWFToKKzexWSY3Ase2iZDa1dBh8
n2sV+AbvAnzXVyp17ICihzlJfIy5eQC3zHeKesO/SMlz05Z9tHPLboXRcduE/oeN
RKbgRvB0BXYF8Mr6mCZ5kqypQVFyuwsdyVDn1wXB1ugMY97GyGsR/sFfD0GF74U/
TH2wQuAjehgcms9AYxc5/ee0M+tKmL9nOU4wrKJvum2k8WU9r724aEhCUfGv5rmO
0QfyUGdNuc7g7lyJPc/x4qDbyhHkA/aosBUSBzUlwssLcQXwFOMqzTs9UwkaBdob
zIRomtY4KgI5073gHhpKxCWjsIlnBuYHlc0K80GV8QKBgQD0JLGFwXjgpSu5/Ux+
l4VZqNXGzJfDKt21OKPL0sFeR58BgSHZIZLZqH/hCSvHW0TDiRAdEW6f7yNzgOv+
LIuVH6zl6nqkd7wH/FGec9TtqMw5+TuFRr6V0JX5mP9wdYjMc8aDfA0ZIPeSFZWp
WHKt5YZ8JjxiUHagI3NknmqxSQKBgQDSx+DDY5cKau995/3n1bL6IRd/WPSgf40q
lhAeDi1ELpa0kqTPO16ryGyeIFspOcEMXr4V3N/JRWRNPkcAflTR8rWMcQ4mR2ft
Ve1iomQO3woIt74/+RvDdCoUwfVAZIpvsAy4al+Fe5o1HnI7HbxQkWI/UvJFrDwf
uXj6JiTAEwKBgDPsQd0CgqS0PBJ4LnaV3wRshdqb1ILrcO+DtkI49msIrGZzgjFd
lI+56EiB3M+vN3amhcjI1lApWc7M0mPiMWVrsSfMsHyeAl1oaita0yQgTB7gRKpZ
m1rdW6gTw++0730b+lIoZdi8TCrDcGrtpqYZNHre3uTB3Bi+sWHq1yIRAoGBAL0T
FweuOjraGeLzS8u+4kGFlbJidW3TfSoKWoLbbLeQoxdvw+8w7odhzi06EQw2Bnm2
MwUhkIzXdlXj24URzbxW34wPjgXAX/WB8uNbkC3W3QVc7YgtST5W4bilE/6jMZtm
bMKwiOcQLRAhM47b6aTMBTmQikr9aSF8Go0p0iWJAoGBAL7pFKVjDFlCL1XQljLY
j/VKLmgyRWqR0OeE9z1TfxSt7j+MiaSCxKJcrYGXvtxYS48w7BwZZu62FZDTsNfG
EmE19X+LRFjAML+U7r5VnpLkiZ0kOWcKaBdzUycUVjeULB8f/XnDFtw6mwyCEc3y
XqB83SF8MJPh5Jx2Y4Mc3GIa
-----END PRIVATE KEY-----`;

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
/** What the fake signing service hands the helper to sign. */
const TO_SIGN = "dG8tc2lnbg==";
/** ASHA_KEY's PKCS#1 v1.5 signature over TO_SIGN, as her token would make it. */
const SIGNATURE = sign(
  "sha256",
  Buffer.from(TO_SIGN, "base64"),
  createPrivateKey(ASHA_KEY)
).toString("base64");

/** Job rows in memory, through KeySeal's own reference adapter. */
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

/** The signing service, as `@keyseal/server` calls it. */
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
      toSign: TO_SIGN,
    });
  }
  return new Response(SIGNED);
}) as typeof fetch;

const { CircularError } = await import("./circulars");
const {
  jobStatusFor,
  keysealJobs,
  startDeclarationJob,
  startEnrolJob,
  startMinutesJob,
  startSignJob,
} = await import("./signing-jobs");

const ASHA = { trustee: { id: "asha", legalName: "Asha Rao" }, userId: "u1" };

/** A started job with its token, the last segment of the link's job URL. */
function started<T extends { link: string }>(job: T): T & { token: string } {
  const jobUrl = new URL(new URL(job.link).searchParams.get("job") ?? "");
  return { ...job, token: jobUrl.pathname.split("/").at(-1) ?? "" };
}

/** The id the page polls with: the SHA-256 of the job token. */
function idOf(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** What the helper sends: a GET claims the job, a POST names its action. */
async function helper(
  token: string,
  action?: "certificate" | "failure" | "signature",
  body?: Record<string, unknown>,
  version = HELPER_VERSION
): Promise<{ body: Record<string, unknown>; status: number }> {
  const response = await keysealJobs().handle(
    new Request(
      `${ORIGIN}/api/signing/v1/jobs/${token}${action ? `/${action}` : ""}`,
      {
        headers: { "X-KeySeal-Version": version },
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
  const { token } = started(await startEnrolJob(ASHA));
  const claimNonce = await claim(token);
  const reply = await helper(token, "certificate", {
    certificate: der,
    chain,
    claimNonce,
  });
  return { reply, token };
}

async function signCircular(circularId = "circular-1") {
  const { token } = started(
    await startSignJob({
      ...ASHA,
      fieldName: "sig_asha",
      pdf: PDF,
      target: { id: circularId, type: "circular" },
      title: "Operation of bank accounts",
    })
  );
  const claimNonce = await claim(token);
  const prepared = await helper(token, "certificate", {
    certificate: ASHA_CERT,
    chain: [],
    claimNonce,
  });
  expect(prepared.status).toBe(200);
  const signed = await helper(token, "signature", {
    claimNonce,
    signatures: [SIGNATURE],
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
  it("serves KeySeal links on the dashboard's origin under /api/signing", async () => {
    const { link, token } = started(await startEnrolJob(ASHA));
    expect(link).toBe(
      `keyseal://enrol?job=${encodeURIComponent(`${ORIGIN}/api/signing/v1/jobs/${token}`)}`
    );
    const reply = await helper(token);
    expect(reply.body).toMatchObject({
      kind: "enrol",
      signer: "Asha Rao",
      title: "DSC enrolment",
    });
  });

  it("serves the manifest", async () => {
    expect(await keysealJobs().manifest().json()).toMatchObject({
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
    const { token } = started(await startEnrolJob(ASHA));
    const reply = await helper(token, undefined, undefined, "0.0.9");
    expect(reply.status).toBe(426);
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      message: "Update the signing helper, then try again.",
      state: "failed",
    });
  });

  it("shows a job's status only to the person who started it", async () => {
    const { token } = started(await startEnrolJob(ASHA));
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({ state: "pending" });
    expect(await jobStatusFor(idOf(token), "someone-else")).toBeNull();
  });

  it("fails the job with the reason the helper gave up", async () => {
    const { token } = started(await startEnrolJob(ASHA));
    const claimNonce = await claim(token);
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({ state: "claimed" });
    await helper(token, "failure", {
      claimNonce,
      message: "No DSC token is plugged in.",
    });
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
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
    const { token } = started(await startEnrolJob(ASHA));
    rateLimited = true;
    expect((await helper(token)).status).toBe(429);
  });

  it("expires a stale job and deletes its PDF", async () => {
    const { token } = started(
      await startSignJob({
        ...ASHA,
        fieldName: "sig_asha",
        pdf: PDF,
        target: { id: "circular-1", type: "circular" },
        title: "Operation of bank accounts",
      })
    );
    expect(objects.size).toBe(1);
    // Starting a job sweeps the ones past their 15 minutes.
    setSystemTime(new Date(Date.now() + 60 * 60_000));
    try {
      started(await startEnrolJob(ASHA));
      expect(objects.size).toBe(0);
      expect((await jobStatusFor(idOf(token), "u1"))?.state).toBe("expired");
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
      const fresh = (await import(specifier)) as { keysealJobs: () => unknown };
      expect(() => fresh.keysealJobs()).toThrow(
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
        issuer: "ASHA RAO",
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
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      state: "completed",
    });
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
      expect((await jobStatusFor(idOf(token), "u1"))?.state).toBe("failed");
    }
    expect(enrolled).toEqual([]);
  });

  it("refuses a token holding someone else's certificate", async () => {
    const { token } = started(
      await startEnrolJob({
        trustee: { id: "vikram", legalName: "Vikram Menon" },
        userId: "u2",
      })
    );
    const claimNonce = await claim(token);
    const reply = await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    expect(reply.status).toBe(422);
    expect(String(reply.body.message)).toContain("Vikram Menon");
    expect(enrolled).toEqual([]);
    expect(await jobStatusFor(idOf(token), "u2")).toEqual({
      message: String(reply.body.message),
      state: "failed",
    });
  });

  it("refuses a certificate no licensed CA issued", async () => {
    trusted = false;
    const { reply, token } = await enrolWith(ASHA_CERT);
    expect(reply.status).toBe(422);
    expect(enrolled).toEqual([]);
    expect((await jobStatusFor(idOf(token), "u1"))?.state).toBe("failed");
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
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      state: "completed",
    });
    // The PDF and the service's state lived in R2 only while the job was open.
    expect(objects.size).toBe(0);
  });

  it("keeps the PDF and state under the signing jobs prefix", async () => {
    const { token } = started(
      await startSignJob({
        ...ASHA,
        fieldName: "sig_asha",
        pdf: PDF,
        target: { id: "circular-1", type: "circular" },
        title: "Operation of bank accounts",
      })
    );
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
    const { token } = started(
      await startSignJob({
        ...ASHA,
        fieldName: "sig_asha",
        pdf: PDF,
        target: { id: "circular-1", type: "circular" },
        title: "Operation of bank accounts",
      })
    );
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
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
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
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      state: "prepared",
    });
    expect(audited).toEqual([
      expect.objectContaining({ action: "circular.sign", outcome: "failure" }),
    ]);
    const retried = await helper(token, "signature", {
      claimNonce,
      signatures: [SIGNATURE],
    });
    expect(retried.status).toBe(200);
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      state: "completed",
    });
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
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      state: "completed",
    });
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
    const { token } = started(
      await startMinutesJob({
        ...ASHA,
        meetingId: "meeting-1",
      })
    );
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
    const { token } = started(
      await startMinutesJob({
        ...ASHA,
        meetingId: "meeting-1",
      })
    );
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    const signed = await helper(token, "signature", {
      claimNonce,
      signatures: [SIGNATURE],
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
    const { token } = started(
      await startDeclarationJob({
        ...ASHA,
        declarationId: "declaration-1",
      })
    );
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
    const { token } = started(
      await startDeclarationJob({
        ...ASHA,
        declarationId: "declaration-1",
      })
    );
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    const signed = await helper(token, "signature", {
      claimNonce,
      signatures: [SIGNATURE],
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
    const { token } = started(
      await startSignJob({
        ...ASHA,
        fieldName: "sig_asha",
        pdf: PDF,
        target: { id: "uc-1", type: "utilisation_certificate" },
        title: "Utilisation certificate UC-1: School kits",
      })
    );
    const claimNonce = await claim(token);
    await helper(token, "certificate", {
      certificate: ASHA_CERT,
      chain: [],
      claimNonce,
    });
    const signed = await helper(token, "signature", {
      claimNonce,
      signatures: [SIGNATURE],
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
    expect(await jobStatusFor(idOf(token), "u1")).toEqual({
      message: "It's the Chief Finance Officer's turn.",
      state: "failed",
    });
  });
});
