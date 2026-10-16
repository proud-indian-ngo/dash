import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, describe, expect, it } from "vitest";

/**
 * Database-backed checks of circular resolutions: issue, objections,
 * signatures, passing with a number and a register change, and failing.
 * Opt in with RESOLUTIONS_DB_TEST=1 and DATABASE_URL pointing at a local,
 * migrated database (a worktree's isolated database). It adds its own
 * trustees and resolutions and deletes them afterwards.
 */

const enabled =
  process.env.RESOLUTIONS_DB_TEST === "1" &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1):\d+\//.test(
    process.env.DATABASE_URL ?? ""
  );

const run = enabled ? describe : describe.skip;

run("circular resolutions in the database", async () => {
  const { db } = await import(".");
  const schema = await import("./schema/governance");
  const q = await import("./queries/resolutions");

  const today = "2026-10-20";
  const trustees = [uuidv7(), uuidv7(), uuidv7()];
  const newcomer = uuidv7();
  const resolutionIds: string[] = [];
  const now = new Date();

  await db.insert(schema.trustee).values(
    [...trustees, newcomer].map((id, i) => ({
      createdAt: now,
      id,
      isCoFounder: false,
      legalName: `DB Test Trustee ${i} ${id.slice(-6)}`,
      updatedAt: now,
    }))
  );
  // Three trustees in office in a year far from the seeded board.
  await db.insert(schema.trusteeTerm).values(
    trustees.map((trusteeId) => ({
      basis: "deed_original" as const,
      createdAt: now,
      id: uuidv7(),
      startsOn: "2019-03-16",
      trusteeId,
      updatedAt: now,
    }))
  );

  afterAll(async () => {
    await db
      .delete(schema.trusteeOffice)
      .where(inArray(schema.trusteeOffice.trusteeId, [...trustees, newcomer]));
    await db
      .delete(schema.trusteeTerm)
      .where(inArray(schema.trusteeTerm.trusteeId, [...trustees, newcomer]));
    if (resolutionIds.length > 0) {
      await db
        .update(schema.resolutionResponse)
        .set({ signatureId: null })
        .where(inArray(schema.resolutionResponse.resolutionId, resolutionIds));
      await db
        .delete(schema.resolutionSignature)
        .where(inArray(schema.resolutionSignature.resolutionId, resolutionIds));
      await db
        .delete(schema.resolutionResponse)
        .where(inArray(schema.resolutionResponse.resolutionId, resolutionIds));
      await db
        .delete(schema.resolutionRevision)
        .where(inArray(schema.resolutionRevision.resolutionId, resolutionIds));
      await db
        .delete(schema.resolution)
        .where(inArray(schema.resolution.id, resolutionIds));
    }
    await db
      .delete(schema.trustee)
      .where(inArray(schema.trustee.id, [...trustees, newcomer]));
  });

  async function draft(
    effect: Parameters<typeof q.effectRegisterProblem>[1]
  ): Promise<string> {
    const id = uuidv7();
    resolutionIds.push(id);
    await db.insert(schema.resolution).values({
      body: "RESOLVED THAT the test passes.",
      createdAt: now,
      effect,
      id,
      templateKey: effect.type === "term_start" ? "appointment" : "ordinary",
      title: "DB test",
      updatedAt: now,
    });
    await q.issueResolution({
      deedVersionId: null,
      issuedOn: today,
      issuerTrusteeId: trustees[0] as string,
      pdf: {
        fieldsPrepared: true,
        objectKey: `test/${id}/issued.pdf`,
        sha256: "a".repeat(64),
      },
      resolutionId: id,
      responseDueOn: "2026-10-27",
      responders: trustees.map((trusteeId) => ({
        fieldName: `Trustee_${trusteeId}`,
        trusteeId,
        userId: null,
      })),
      threshold: "majority_in_office",
    });
    return id;
  }

  function signature(trusteeId: string) {
    return {
      coversWholeRevision: true,
      fieldName: `Trustee_${trusteeId}`,
      intact: true,
      issuer: "Test CA",
      matchedTrusteeId: trusteeId,
      modificationLevel: "FORM_FILLING",
      notAfter: null,
      notBefore: null,
      serial: "01",
      sha256Fingerprint: "f".repeat(64),
      signerName: "TEST",
      signingTime: "2026-10-20T10:00:00Z",
      subject: "CN=TEST",
      timestamped: false,
      trusted: true,
    };
  }

  it("passes with a majority of signatures, numbers it and appoints the trustee", async () => {
    const id = await draft({
      basis: "co_option_4_5",
      endsOn: "2029-10-19",
      startsOn: "2026-10-20",
      trusteeId: newcomer,
      type: "term_start",
    });
    const first = await q.recordSignature({
      basedOnSha256: "a".repeat(64),
      createdBy: null,
      method: "acrobat_upload",
      objectKey: `test/${id}/1.pdf`,
      resolutionId: id,
      sha256: "b".repeat(64),
      signature: signature(trustees[0] as string),
      today,
      trusteeId: trustees[0] as string,
    });
    expect(first.status).toBe("issued");

    // A signer working from the issued PDF after someone else signed is refused.
    await expect(
      q.recordSignature({
        basedOnSha256: "a".repeat(64),
        createdBy: null,
        method: "acrobat_upload",
        objectKey: `test/${id}/stale.pdf`,
        resolutionId: id,
        sha256: "c".repeat(64),
        signature: signature(trustees[1] as string),
        today,
        trusteeId: trustees[1] as string,
      })
    ).rejects.toThrow("Someone else signed");

    const second = await q.recordSignature({
      basedOnSha256: "b".repeat(64),
      createdBy: null,
      method: "acrobat_upload",
      objectKey: `test/${id}/2.pdf`,
      resolutionId: id,
      sha256: "d".repeat(64),
      signature: signature(trustees[1] as string),
      today,
      trusteeId: trustees[1] as string,
    });
    expect(second.status).toBe("passed");
    expect(second.number).toMatch(/^PI\/TR\/2026-27\/\d{3}$/);

    const [term] = await db
      .select()
      .from(schema.trusteeTerm)
      .where(eq(schema.trusteeTerm.trusteeId, newcomer));
    expect(term).toMatchObject({
      basis: "co_option_4_5",
      endsOn: "2029-10-19",
      sourceResolutionId: id,
      startsOn: "2026-10-20",
    });

    // The last trustee can no longer respond.
    await expect(
      q.recordObjection({
        reason: "late",
        resolutionId: id,
        today,
        trusteeId: trustees[2] as string,
      })
    ).rejects.toThrow("no longer open");
  });

  it("fails when objections make a majority unreachable", async () => {
    const id = await draft({ type: "none" });
    await q.recordObjection({
      reason: "No budget",
      resolutionId: id,
      today,
      trusteeId: trustees[0] as string,
    });
    const decision = await q.recordObjection({
      reason: "Agree with the first objection",
      resolutionId: id,
      today,
      trusteeId: trustees[1] as string,
    });
    expect(decision.status).toBe("failed");
    const [row] = await db
      .select()
      .from(schema.resolution)
      .where(and(eq(schema.resolution.id, id)));
    expect(row?.number).toBeNull();
    expect(row?.outcomeNote).toContain("objections");
  });

  it("fails an overdue circular when the closing job runs", async () => {
    const id = await draft({ type: "none" });
    expect(await q.overdueResolutionIds("2026-10-28")).toContain(id);
    const decision = await q.decideResolution(id, "2026-10-28");
    expect(decision.status).toBe("failed");
  });
});
