import { answersText } from "@pi-dash/shared/resolutions";
import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Database-backed checks of circulars: issue, objections, one signature per
 * trustee assenting to the rest, each resolution passing with a number and
 * a register change or failing on its own, and withdrawal.
 * Opt in with RESOLUTIONS_DB_TEST=1 and DATABASE_URL pointing at a local,
 * migrated database (a worktree's isolated database). It adds its own
 * trustees and resolutions and deletes them afterwards.
 */

const enabled =
  process.env.RESOLUTIONS_DB_TEST === "1" &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1):\d+\//.test(
    process.env.DATABASE_URL ?? ""
  );

// Nothing touches a database unless opted in: Vitest runs a skipped
// suite's body while collecting it, so all setup lives in beforeAll.
describe.skipIf(!enabled)("circular resolutions in the database", () => {
  const today = "2026-10-20";
  const trustees = [uuidv7(), uuidv7(), uuidv7()];
  const newcomer = uuidv7();
  const resolutionIds: string[] = [];
  const circularIds: string[] = [];
  const documentIds: string[] = [];
  const now = new Date();
  let db: typeof import(".").db;
  let schema: typeof import("./schema/governance");
  let q: typeof import("./queries/resolutions");

  beforeAll(async () => {
    db = (await import(".")).db;
    schema = await import("./schema/governance");
    q = await import("./queries/resolutions");
    await db.insert(schema.trustee).values(
      [...trustees, newcomer].map((id, i) => ({
        createdAt: now,
        id,
        isCoFounder: false,
        legalName: `DB Test Trustee ${i} ${id.slice(-6)}`,
        updatedAt: now,
      }))
    );
    // Three more trustees in office alongside whatever the database holds.
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
  });

  afterAll(async () => {
    await db
      .delete(schema.trusteeOffice)
      .where(inArray(schema.trusteeOffice.trusteeId, [...trustees, newcomer]));
    await db
      .delete(schema.trusteeTerm)
      .where(inArray(schema.trusteeTerm.trusteeId, [...trustees, newcomer]));
    if (resolutionIds.length > 0) {
      // Reopen the offices the test designations took over.
      await db
        .update(schema.trusteeOffice)
        .set({
          endEvidenceDocumentId: null,
          endSourceResolutionId: null,
          endedOn: null,
        })
        .where(
          inArray(schema.trusteeOffice.endSourceResolutionId, resolutionIds)
        );
      await db
        .update(schema.resolutionResponse)
        .set({ signatureId: null })
        .where(inArray(schema.resolutionResponse.resolutionId, resolutionIds));
      await db
        .delete(schema.resolutionResponse)
        .where(inArray(schema.resolutionResponse.resolutionId, resolutionIds));
      await db
        .delete(schema.resolution)
        .where(inArray(schema.resolution.id, resolutionIds));
    }
    if (circularIds.length > 0) {
      await db
        .delete(schema.circularSignature)
        .where(inArray(schema.circularSignature.circularId, circularIds));
      await db
        .delete(schema.circularRevision)
        .where(inArray(schema.circularRevision.circularId, circularIds));
      await db
        .delete(schema.circular)
        .where(inArray(schema.circular.id, circularIds));
    }
    if (documentIds.length > 0) {
      await db
        .delete(schema.governanceDocument)
        .where(inArray(schema.governanceDocument.id, documentIds));
    }
    await db
      .delete(schema.trustee)
      .where(inArray(schema.trustee.id, [...trustees, newcomer]));
  });

  type Effect = Parameters<
    typeof import("./queries/resolutions").effectRegisterProblem
  >[1];

  const TEMPLATES = {
    none: "ordinary",
    office_start: "office_bearer",
    removal: "removal",
    term_end: "cessation",
    term_start: "appointment",
  } as const;

  /** Drafts one resolution per effect and issues them together. */
  async function issue(
    effects: Effect[]
  ): Promise<{ circularId: string; ids: string[] }> {
    const circularId = uuidv7();
    circularIds.push(circularId);
    const ids = effects.map(() => uuidv7());
    resolutionIds.push(...ids);
    await db.insert(schema.resolution).values(
      effects.map((effect, i) => ({
        body: "RESOLVED THAT the test passes.",
        createdAt: now,
        effect,
        id: ids[i] as string,
        templateKey: TEMPLATES[effect.type],
        title: `DB test ${i + 1}`,
        updatedAt: now,
      }))
    );
    await q.issueCircular({
      circularId,
      deedVersionId: null,
      issuerTrusteeId: trustees[0] as string,
      pdf: {
        fieldsPrepared: true,
        objectKey: `test/${circularId}/issued.pdf`,
        sha256: "a".repeat(64),
      },
      resolutions: ids.map((id) => ({
        id,
        renderedFrom: now,
        threshold: "majority_in_office",
      })),
      responders: trustees.map((trusteeId) => ({
        fieldName: `Trustee_${trusteeId}`,
        trusteeId,
        userId: null,
      })),
      responseDueOn: "2026-10-27",
      stillPlanned: () => true,
      today,
    });
    return { circularId, ids };
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

  /** Signs as a trustee with their answers as they stand. */
  async function sign(
    circularId: string,
    trusteeId: string,
    from: string,
    to: string
  ) {
    const state = await q.signerState(db, circularId, trusteeId);
    return await q.recordSignature({
      answers: answersText(state?.answers ?? []),
      basedOnSha256: from,
      circularId,
      createdBy: null,
      method: "acrobat_upload",
      objectKey: `test/${circularId}/${to}.pdf`,
      sha256: to,
      signature: signature(trusteeId),
      today,
      trusteeId,
    });
  }

  /** Ends the newcomer's appointment so the next test can appoint them again. */
  async function removeNewcomer() {
    await db
      .delete(schema.trusteeOffice)
      .where(eq(schema.trusteeOffice.trusteeId, newcomer));
    await db
      .delete(schema.trusteeTerm)
      .where(eq(schema.trusteeTerm.trusteeId, newcomer));
  }

  const statusOf = (decisions: { resolutionId: string; status: string }[]) =>
    Object.fromEntries(decisions.map((d) => [d.resolutionId, d.status]));

  it("passes with a majority of signatures, numbers it and appoints the trustee", async () => {
    const {
      circularId,
      ids: [id],
    } = await issue([
      {
        basis: "co_option_4_5",
        endsOn: "2029-10-19",
        startsOn: "2026-10-20",
        trusteeId: newcomer,
        type: "term_start",
      },
    ]);
    const first = await sign(
      circularId,
      trustees[0] as string,
      "a".repeat(64),
      "b".repeat(64)
    );
    expect(first[0]?.status).toBe("issued");

    // A signer working from the issued PDF after someone else signed is refused.
    await expect(
      sign(circularId, trustees[1] as string, "a".repeat(64), "c".repeat(64))
    ).rejects.toThrow("Someone else signed");
    // So is one whose PDF carries answers that aren't theirs now.
    await expect(
      q.recordSignature({
        answers: "Resolution 1: objects",
        basedOnSha256: "b".repeat(64),
        circularId,
        createdBy: null,
        method: "acrobat_upload",
        objectKey: `test/${circularId}/wrong.pdf`,
        sha256: "e".repeat(64),
        signature: signature(trustees[1] as string),
        today,
        trusteeId: trustees[1] as string,
      })
    ).rejects.toThrow("answers changed");

    const second = await sign(
      circularId,
      trustees[1] as string,
      "b".repeat(64),
      "d".repeat(64)
    );
    expect(second[0]?.status).toBe("passed");
    expect(second[0]?.number).toMatch(/^PI\/TR\/2026-27\/\d{3}$/);

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

    // The last trustee can no longer respond, nor sign.
    await expect(
      q.recordObjection({
        reason: "late",
        resolutionId: id as string,
        today,
        trusteeId: trustees[2] as string,
      })
    ).rejects.toThrow("no longer open");
    await expect(
      sign(circularId, trustees[2] as string, "d".repeat(64), "f".repeat(64))
    ).rejects.toThrow("nothing left");

    await removeNewcomer();
  });

  it("decides each resolution of a circular on its own, in order", async () => {
    const {
      circularId,
      ids: [appointment, designation],
    } = await issue([
      {
        basis: "co_option_4_5",
        endsOn: null,
        startsOn: "2026-10-20",
        trusteeId: newcomer,
        type: "term_start",
      },
      {
        office: "secretary",
        startsOn: "2026-10-21",
        trusteeId: newcomer,
        type: "office_start",
      },
    ]);
    await q.recordObjection({
      reason: "Too soon",
      resolutionId: designation as string,
      today,
      trusteeId: trustees[0] as string,
    });
    const state = await q.signerState(db, circularId, trustees[0] as string);
    expect(answersText(state?.answers ?? [])).toBe(
      "Resolution 1: assents; Resolution 2: objects"
    );
    const first = await sign(
      circularId,
      trustees[0] as string,
      "a".repeat(64),
      "1".repeat(64)
    );
    expect(statusOf(first)).toEqual({
      [appointment as string]: "issued",
      [designation as string]: "issued",
    });
    // The second signature passes the appointment; the designation has one.
    const second = await sign(
      circularId,
      trustees[1] as string,
      "1".repeat(64),
      "2".repeat(64)
    );
    expect(statusOf(second)).toEqual({
      [appointment as string]: "passed",
      [designation as string]: "issued",
    });
    // The appointment passed before the third trustee signed: their
    // signature doesn't assent to it, and their answers say so.
    const late = await q.signerState(db, circularId, trustees[2] as string);
    expect(answersText(late?.answers ?? [])).toBe(
      "Resolution 1: decided before signing; Resolution 2: assents"
    );
    const third = await sign(
      circularId,
      trustees[2] as string,
      "2".repeat(64),
      "3".repeat(64)
    );
    expect(statusOf(third)).toEqual({ [designation as string]: "passed" });
    const [lateOnAppointment] = await db
      .select()
      .from(schema.resolutionResponse)
      .where(
        and(
          eq(schema.resolutionResponse.resolutionId, appointment as string),
          eq(schema.resolutionResponse.trusteeId, trustees[2] as string)
        )
      );
    expect(lateOnAppointment).toMatchObject({
      response: "pending",
      signatureId: null,
    });

    const [office] = await db
      .select()
      .from(schema.trusteeOffice)
      .where(eq(schema.trusteeOffice.trusteeId, newcomer));
    expect(office).toMatchObject({
      office: "secretary",
      sourceResolutionId: designation,
    });
    const signatures = await db
      .select({ answers: schema.circularSignature.answers })
      .from(schema.circularSignature)
      .where(eq(schema.circularSignature.circularId, circularId));
    expect(signatures.map((s) => s.answers)).toContain(
      "Resolution 1: assents; Resolution 2: objects"
    );
    await removeNewcomer();
  });

  it("holds a designation that reaches its count until the appointment is decided", async () => {
    const {
      circularId,
      ids: [appointment, designation],
    } = await issue([
      {
        basis: "co_option_4_5",
        endsOn: null,
        startsOn: "2026-10-20",
        trusteeId: newcomer,
        type: "term_start",
      },
      {
        office: "secretary",
        startsOn: "2026-10-21",
        trusteeId: newcomer,
        type: "office_start",
      },
    ]);
    await q.recordObjection({
      reason: "Not yet",
      resolutionId: appointment as string,
      today,
      trusteeId: trustees[0] as string,
    });
    await sign(
      circularId,
      trustees[0] as string,
      "a".repeat(64),
      "4".repeat(64)
    );
    // A second signature from the same trustee is refused.
    await expect(
      sign(circularId, trustees[0] as string, "4".repeat(64), "9".repeat(64))
    ).rejects.toThrow("nothing left");
    // Two signatures reach the designation's count, but its holder isn't a
    // trustee until the appointment passes, so it stays open.
    const second = await sign(
      circularId,
      trustees[1] as string,
      "4".repeat(64),
      "5".repeat(64)
    );
    expect(statusOf(second)).toEqual({
      [appointment as string]: "issued",
      [designation as string]: "issued",
    });
    const third = await sign(
      circularId,
      trustees[2] as string,
      "5".repeat(64),
      "6".repeat(64)
    );
    expect(statusOf(third)).toEqual({
      [appointment as string]: "passed",
      [designation as string]: "passed",
    });
    await removeNewcomer();
  });

  it("files start and end evidence from the resolution that made each", async () => {
    const {
      circularId: first,
      ids: [appointment, designation],
    } = await issue([
      {
        basis: "co_option_4_5",
        endsOn: null,
        startsOn: "2026-10-20",
        trusteeId: newcomer,
        type: "term_start",
      },
      {
        office: "secretary",
        startsOn: "2026-10-21",
        trusteeId: newcomer,
        type: "office_start",
      },
    ]);
    await sign(first, trustees[0] as string, "a".repeat(64), "6".repeat(64));
    await sign(first, trustees[1] as string, "6".repeat(64), "7".repeat(64));
    const {
      circularId: second,
      ids: [cessation],
    } = await issue([
      {
        cessationBasis: "resignation",
        endedOn: "2026-10-22",
        trusteeId: newcomer,
        type: "term_end",
      },
    ]);
    await sign(second, trustees[0] as string, "a".repeat(64), "8".repeat(64));
    const decided = await sign(
      second,
      trustees[1] as string,
      "8".repeat(64),
      "0".repeat(64)
    );
    expect(statusOf(decided)).toEqual({ [cessation as string]: "passed" });

    const docs = [appointment, designation, cessation].map(() => uuidv7());
    documentIds.push(...docs);
    await db.insert(schema.governanceDocument).values(
      docs.map((id) => ({
        contentType: "application/pdf",
        createdAt: now,
        datedOn: today,
        id,
        kind: "resolution" as const,
        objectKey: `test/${id}.pdf`,
        originalFilename: "resolution.pdf",
        sha256: id.replaceAll("-", "").padEnd(64, "0"),
        sizeBytes: 1,
        sourceFormat: "signed_pdf" as const,
        title: "DB test resolution",
      }))
    );
    // The cessation is filed first; the term it ended still gets its start.
    await q.setFinalDocument(cessation as string, docs[2] as string);
    await q.setFinalDocument(appointment as string, docs[0] as string);
    await q.setFinalDocument(designation as string, docs[1] as string);

    const [term] = await db
      .select()
      .from(schema.trusteeTerm)
      .where(eq(schema.trusteeTerm.trusteeId, newcomer));
    expect(term).toMatchObject({
      endEvidenceDocumentId: docs[2],
      endSourceResolutionId: cessation,
      endedOn: "2026-10-22",
      sourceResolutionId: appointment,
      startEvidenceDocumentId: docs[0],
    });
    const [office] = await db
      .select()
      .from(schema.trusteeOffice)
      .where(eq(schema.trusteeOffice.trusteeId, newcomer));
    expect(office).toMatchObject({
      endEvidenceDocumentId: docs[2],
      endSourceResolutionId: cessation,
      sourceResolutionId: designation,
      startEvidenceDocumentId: docs[1],
    });
    // A secretary the designation replaced ends on its resolution too.
    const replaced = await db
      .select()
      .from(schema.trusteeOffice)
      .where(
        eq(schema.trusteeOffice.endSourceResolutionId, designation as string)
      );
    for (const row of replaced) {
      expect(row).toMatchObject({
        endEvidenceDocumentId: docs[1],
        endedOn: "2026-10-21",
      });
    }
    await removeNewcomer();
  });

  it("leaves an office that ended with its holder's fixed term alone", async () => {
    // The newcomer's first term ran out with their office recorded open.
    const expiredOffice = uuidv7();
    await db.insert(schema.trusteeTerm).values([
      {
        basis: "co_option_4_5",
        createdAt: now,
        endsOn: "2022-12-31",
        id: uuidv7(),
        startsOn: "2020-01-01",
        trusteeId: newcomer,
        updatedAt: now,
      },
      {
        basis: "co_option_4_5",
        createdAt: now,
        id: uuidv7(),
        startsOn: "2026-10-01",
        trusteeId: newcomer,
        updatedAt: now,
      },
    ]);
    await db.insert(schema.trusteeOffice).values({
      createdAt: now,
      id: expiredOffice,
      office: "treasurer",
      startsOn: "2020-01-01",
      trusteeId: newcomer,
      updatedAt: now,
    });
    const {
      circularId,
      ids: [designation, cessation],
    } = await issue([
      {
        office: "treasurer",
        startsOn: "2026-10-21",
        trusteeId: trustees[2] as string,
        type: "office_start",
      },
      {
        cessationBasis: "resignation",
        endedOn: "2026-10-22",
        trusteeId: newcomer,
        type: "term_end",
      },
    ]);
    await sign(
      circularId,
      trustees[0] as string,
      "a".repeat(64),
      "c".repeat(64)
    );
    const decided = await sign(
      circularId,
      trustees[1] as string,
      "c".repeat(64),
      "d".repeat(64)
    );
    expect(statusOf(decided)).toEqual({
      [cessation as string]: "passed",
      [designation as string]: "passed",
    });
    const [office] = await db
      .select()
      .from(schema.trusteeOffice)
      .where(eq(schema.trusteeOffice.id, expiredOffice));
    expect(office).toMatchObject({
      endSourceResolutionId: null,
      endedOn: null,
    });
    await removeNewcomer();
  });

  it("fails when objections make a majority unreachable", async () => {
    const {
      ids: [id],
    } = await issue([{ type: "none" }]);
    await q.recordObjection({
      reason: "No budget",
      resolutionId: id as string,
      today,
      trusteeId: trustees[0] as string,
    });
    const decisions = await q.recordObjection({
      reason: "Agree with the first objection",
      resolutionId: id as string,
      today,
      trusteeId: trustees[1] as string,
    });
    expect(statusOf(decisions)).toEqual({ [id as string]: "failed" });
    const [row] = await db
      .select()
      .from(schema.resolution)
      .where(and(eq(schema.resolution.id, id as string)));
    expect(row?.number).toBeNull();
    expect(row?.outcomeNote).toContain("objections");
  });

  it("fails an overdue circular's resolutions when the closing job runs", async () => {
    const { circularId, ids } = await issue([
      { type: "none" },
      { type: "none" },
    ]);
    expect(await q.overdueCircularIds("2026-10-28")).toContain(circularId);
    const decisions = await q.decideCircular(
      circularId,
      "2026-10-28",
      async () => undefined
    );
    expect(decisions.map((d) => d.status)).toEqual(["failed", "failed"]);
    expect(decisions.map((d) => d.resolutionId)).toEqual(ids);
  });

  it("withdraws only the resolutions still open", async () => {
    const {
      circularId,
      ids: [kept, open],
    } = await issue([{ type: "none" }, { type: "none" }]);
    await q.recordObjection({
      reason: "No",
      resolutionId: kept as string,
      today,
      trusteeId: trustees[0] as string,
    });
    await q.recordObjection({
      reason: "No",
      resolutionId: kept as string,
      today,
      trusteeId: trustees[1] as string,
    });
    expect(
      await q.withdrawCircular({ circularId, reason: "Redraft", today })
    ).toEqual([open]);
    await expect(
      q.withdrawCircular({ circularId, reason: "Again", today })
    ).rejects.toThrow("already decided");
  });
});
