import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SigningJob } from "./queries/signing";

/**
 * Database-backed checks of the KeySeal job store behind the DSC helper: the
 * adapter contract `@keyseal/server` relies on (atomic transitions on state
 * and lease start, expiry that spares a live lease).
 * Opt in with SIGNING_DB_TEST=1 and DATABASE_URL pointing at a local,
 * migrated database. It adds its own jobs and deletes them afterwards.
 */

const enabled =
  process.env.SIGNING_DB_TEST === "1" &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1):\d+\//.test(
    process.env.DATABASE_URL ?? ""
  );

describe.skipIf(!enabled)("KeySeal jobs in the database", () => {
  const ids: string[] = [];
  let db: typeof import(".").db;
  let schema: typeof import("./schema/private/trustee-private");
  let q: typeof import("./queries/signing");

  function job(overrides: Partial<SigningJob> = {}): SigningJob {
    const id = crypto.randomUUID().replaceAll("-", "").padEnd(64, "0");
    ids.push(id);
    return {
      certificate: null,
      certificatePolicy: null,
      chain: null,
      claimNonceHash: null,
      createdAt: new Date("2026-10-22T10:00:00.123Z"),
      digestAlgorithm: null,
      documents: [
        {
          fieldName: "sig_asha",
          signatureDetails: null,
          stampStyle: "proud-indian",
          title: "Operation of bank accounts",
          toSign: null,
        },
      ],
      error: null,
      expectedCertificateSha256: "e".repeat(64),
      id,
      kind: "sign",
      leaseStartedAt: null,
      reference: '{"userId":"u1"}',
      rsaPadding: "pkcs1",
      signer: "Asha Rao",
      state: "pending",
      stateKey: null,
      title: "Operation of bank accounts",
      ...overrides,
    };
  }

  beforeAll(async () => {
    db = (await import(".")).db;
    schema = await import("./schema/private/trustee-private");
    q = await import("./queries/signing");
  });

  afterAll(async () => {
    if (ids.length > 0) {
      await db
        .delete(schema.signingJob)
        .where(inArray(schema.signingJob.tokenHash, ids));
    }
  });

  it("keeps a job as it was created, by its token hash", async () => {
    const created = job({ chain: ["Y2E="], digestAlgorithm: "sha384" });
    await q.insertSigningJob(created);
    expect(await q.getSigningJob(created.id)).toEqual(created);
    expect(await q.getSigningJob("0".repeat(64))).toBeNull();
  });

  it("moves a job only from the state and lease start it expects", async () => {
    const created = job();
    await q.insertSigningJob(created);
    const lease = new Date("2026-10-22T10:01:00.456Z");
    expect(
      await q.transitionSigningJob(
        created.id,
        { leaseStartedAt: null, state: "claimed" },
        { leaseStartedAt: lease }
      )
    ).toBe(false);
    expect(
      await q.transitionSigningJob(
        created.id,
        { leaseStartedAt: null, state: "pending" },
        { claimNonceHash: "n".repeat(64), state: "claimed" }
      )
    ).toBe(true);
    expect(
      await q.transitionSigningJob(
        created.id,
        { leaseStartedAt: null, state: "claimed" },
        { leaseStartedAt: lease }
      )
    ).toBe(true);
    // A second request holding a stale view of the lease loses.
    expect(
      await q.transitionSigningJob(
        created.id,
        { leaseStartedAt: null, state: "claimed" },
        { leaseStartedAt: new Date() }
      )
    ).toBe(false);
    // Compared by time, so a fresh Date for the same instant matches.
    expect(
      await q.transitionSigningJob(
        created.id,
        { leaseStartedAt: new Date(lease.getTime()), state: "claimed" },
        { leaseStartedAt: null, state: "failed", error: "No token." }
      )
    ).toBe(true);
    expect(await q.getSigningJob(created.id)).toMatchObject({
      claimNonceHash: "n".repeat(64),
      error: "No token.",
      leaseStartedAt: null,
      state: "failed",
    });
  });

  it("lets only one of two racing transitions through", async () => {
    const created = job();
    await q.insertSigningJob(created);
    const results = await Promise.all(
      [1, 2].map((n) =>
        q.transitionSigningJob(
          created.id,
          { leaseStartedAt: null, state: "pending" },
          { claimNonceHash: String(n).repeat(64), state: "claimed" }
        )
      )
    );
    expect(results.toSorted()).toEqual([false, true]);
  });

  it("expires open jobs past the cutoff unless a live lease holds them", async () => {
    const cutoff = new Date("2026-10-22T10:15:00Z");
    const leaseCutoff = new Date("2026-10-22T10:10:00Z");
    const old = job({ state: "claimed" });
    const leased = job({
      leaseStartedAt: new Date("2026-10-22T10:12:00Z"),
      state: "prepared",
      stateKey: "x/state/1",
    });
    const lapsed = job({
      leaseStartedAt: new Date("2026-10-22T10:05:00Z"),
      state: "prepared",
      stateKey: "y/state/1",
    });
    const recent = job({ createdAt: new Date("2026-10-22T10:20:00Z") });
    const done = job({ state: "completed" });
    for (const created of [old, leased, lapsed, recent, done]) {
      await q.insertSigningJob(created);
    }
    const ours = new Set([old, leased, lapsed, recent, done].map((j) => j.id));
    const expired = await q.expireSigningJobs(cutoff, leaseCutoff);
    const mine = expired.filter((e) => ours.has(e.id));
    expect(mine.map((e) => e.id).toSorted()).toEqual(
      [old.id, lapsed.id].toSorted()
    );
    // Returned as they were, so their blobs can be deleted.
    expect(mine.find((e) => e.id === lapsed.id)).toMatchObject({
      state: "prepared",
      stateKey: "y/state/1",
    });
    expect((await q.getSigningJob(old.id))?.state).toBe("expired");
    expect((await q.getSigningJob(leased.id))?.state).toBe("prepared");
    expect((await q.getSigningJob(recent.id))?.state).toBe("pending");
    expect((await q.getSigningJob(done.id))?.state).toBe("completed");
  });
});
