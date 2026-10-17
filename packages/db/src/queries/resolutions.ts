import {
  DEED_VERSION_1,
  deedVersionOn,
  newRegisterProblems,
  type OfficeRow,
  type RegisterInput,
  type TermRow,
} from "@pi-dash/shared/governance";
import { financialYearOf } from "@pi-dash/shared/income";
import {
  effectSubject,
  formatResolutionNumber,
  type ResolutionEffect,
  type ResponseState,
  type Tally,
  tallyCircular,
} from "@pi-dash/shared/resolutions";
import { and, eq, isNull, max, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  deedVersion,
  type GovernanceValidationReport,
  resolution,
  resolutionResponse,
  resolutionRevision,
  resolutionSignature,
  trustee,
  trusteeOffice,
  trusteeTerm,
} from "../schema/governance";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<typeof db, "select">;

export class ResolutionError extends Error {}

/** Rows as the shared rules read them. */
export async function loadRegister(
  executor: Executor,
  on: string
): Promise<
  RegisterInput<{
    id: string;
    isCoFounder: boolean;
    legalName: string;
    userId: string | null;
  }> & { deedVersionId: string | null }
> {
  const [trustees, terms, offices, versions] = await Promise.all([
    executor
      .select({
        id: trustee.id,
        isCoFounder: trustee.isCoFounder,
        legalName: trustee.legalName,
        userId: trustee.userId,
      })
      .from(trustee),
    executor.select().from(trusteeTerm),
    executor.select().from(trusteeOffice),
    executor.select().from(deedVersion),
  ]);
  const inForce = deedVersionOn(versions, on);
  return {
    deedVersionId: inForce?.id ?? null,
    offices: offices.map((o): OfficeRow => ({
      endEvidenceDocumentId: o.endEvidenceDocumentId,
      endedOn: o.endedOn,
      id: o.id,
      office: o.office,
      startEvidenceDocumentId: o.startEvidenceDocumentId,
      startsOn: o.startsOn,
      trusteeId: o.trusteeId,
    })),
    rules: inForce
      ? {
          amendmentThreshold: inForce.amendmentThreshold,
          castingVote: inForce.castingVote,
          circularIssuers: inForce.circularIssuers,
          coOptionMaxYears: inForce.coOptionMaxYears,
          electronicCirculation: inForce.electronicCirculation,
          maxTrustees: inForce.maxTrustees,
          minTrustees: inForce.minTrustees,
          noticeDays: inForce.noticeDays,
          quorumFloor: inForce.quorumFloor,
          quorumKind: inForce.quorumKind,
          quorumRequiredOffice: inForce.quorumRequiredOffice,
          quorumValue: inForce.quorumValue,
          videoCountsPresent: inForce.videoCountsPresent,
        }
      : DEED_VERSION_1.rules,
    terms: terms.map((t): TermRow => ({
      basis: t.basis,
      endEvidenceDocumentId: t.endEvidenceDocumentId,
      endedOn: t.endedOn,
      endsOn: t.endsOn,
      id: t.id,
      startEvidenceDocumentId: t.startEvidenceDocumentId,
      startsOn: t.startsOn,
      trusteeId: t.trusteeId,
    })),
    trustees: trustees.map((t) => ({
      id: t.id,
      isCoFounder: t.isCoFounder,
      legalName: t.legalName,
      userId: t.userId,
    })),
  };
}

export async function getResolution(id: string) {
  const [row] = await db
    .select()
    .from(resolution)
    .where(eq(resolution.id, id))
    .limit(1);
  return row ?? null;
}

async function lockResolution(tx: Tx, id: string) {
  const [row] = await tx
    .select()
    .from(resolution)
    .where(eq(resolution.id, id))
    .for("update")
    .limit(1);
  if (!row) {
    throw new ResolutionError("Resolution not found");
  }
  return row;
}

// ── Register effects ────────────────────────────────────────────────────────

/**
 * What a passed resolution's effect would add or change, applied to the
 * register in memory, so the same check runs at issue and at pass.
 */
export function registerAfterEffect(
  register: RegisterInput,
  effect: ResolutionEffect,
  ids: { officeId: string; termId: string }
): RegisterInput {
  switch (effect.type) {
    case "none":
      return register;
    case "term_start":
      return {
        ...register,
        terms: [
          ...register.terms,
          {
            basis: effect.basis,
            endEvidenceDocumentId: null,
            endedOn: null,
            endsOn: effect.endsOn,
            id: ids.termId,
            startEvidenceDocumentId: null,
            startsOn: effect.startsOn,
            trusteeId: effect.trusteeId,
          },
        ],
      };
    case "term_end":
    case "removal": {
      const open = register.terms.find(
        (t) => t.trusteeId === effect.trusteeId && t.endedOn === null
      );
      return {
        ...register,
        offices: register.offices.map((o) =>
          o.trusteeId === effect.trusteeId &&
          o.endedOn === null &&
          o.startsOn < effect.endedOn
            ? { ...o, endedOn: effect.endedOn }
            : o
        ),
        terms: register.terms.map((t) =>
          t.id === open?.id ? { ...t, endedOn: effect.endedOn } : t
        ),
      };
    }
    case "office_start":
      return {
        ...register,
        offices: [
          ...register.offices.map((o) =>
            o.office === effect.office &&
            o.endedOn === null &&
            o.startsOn < effect.startsOn
              ? { ...o, endedOn: effect.startsOn }
              : o
          ),
          {
            endEvidenceDocumentId: null,
            endedOn: null,
            id: ids.officeId,
            office: effect.office,
            startEvidenceDocumentId: null,
            startsOn: effect.startsOn,
            trusteeId: effect.trusteeId,
          },
        ],
      };
    default: {
      const never: never = effect;
      return never;
    }
  }
}

/** Why an effect can't be applied to the register as it stands, or null. */
export function effectRegisterProblem(
  register: RegisterInput,
  effect: ResolutionEffect
): string | null {
  if (effect.type === "none") {
    return null;
  }
  if (!register.trustees.some((t) => t.id === effect.trusteeId)) {
    return "The trustee isn't on the register.";
  }
  if (effect.type === "term_end" || effect.type === "removal") {
    const open = register.terms.find(
      (t) => t.trusteeId === effect.trusteeId && t.endedOn === null
    );
    if (!open) {
      return "That trustee has no open term to end.";
    }
    if (effect.endedOn <= open.startsOn) {
      return "The cessation date must come after the term started.";
    }
  }
  const after = registerAfterEffect(register, effect, {
    officeId: "__new_office__",
    termId: "__new_term__",
  });
  return newRegisterProblems(register, after)[0] ?? null;
}

async function applyEffect(
  tx: Tx,
  resolutionId: string,
  effect: ResolutionEffect,
  documentId: string | null
): Promise<void> {
  const now = new Date();
  switch (effect.type) {
    case "none":
      return;
    case "term_start":
      await tx.insert(trusteeTerm).values({
        basis: effect.basis,
        createdAt: now,
        endsOn: effect.endsOn,
        id: uuidv7(),
        sourceResolutionId: resolutionId,
        startEvidenceDocumentId: documentId,
        startsOn: effect.startsOn,
        trusteeId: effect.trusteeId,
        updatedAt: now,
      });
      return;
    case "term_end":
    case "removal": {
      const cessationBasis =
        effect.type === "removal" ? "removal_7_12" : effect.cessationBasis;
      await tx
        .update(trusteeOffice)
        .set({
          endEvidenceDocumentId: documentId,
          endedOn: effect.endedOn,
          sourceResolutionId: resolutionId,
          updatedAt: now,
        })
        .where(
          and(
            eq(trusteeOffice.trusteeId, effect.trusteeId),
            isNull(trusteeOffice.endedOn),
            sql`${trusteeOffice.startsOn} < ${effect.endedOn}`
          )
        );
      await tx
        .update(trusteeTerm)
        .set({
          cessationBasis,
          endEvidenceDocumentId: documentId,
          endedOn: effect.endedOn,
          sourceResolutionId: resolutionId,
          updatedAt: now,
        })
        .where(
          and(
            eq(trusteeTerm.trusteeId, effect.trusteeId),
            isNull(trusteeTerm.endedOn)
          )
        );
      return;
    }
    case "office_start":
      await tx
        .update(trusteeOffice)
        .set({
          endEvidenceDocumentId: documentId,
          endedOn: effect.startsOn,
          updatedAt: now,
        })
        .where(
          and(
            eq(trusteeOffice.office, effect.office),
            isNull(trusteeOffice.endedOn),
            sql`${trusteeOffice.startsOn} < ${effect.startsOn}`
          )
        );
      await tx.insert(trusteeOffice).values({
        createdAt: now,
        id: uuidv7(),
        office: effect.office,
        sourceResolutionId: resolutionId,
        startEvidenceDocumentId: documentId,
        startsOn: effect.startsOn,
        trusteeId: effect.trusteeId,
        updatedAt: now,
      });
      return;
    default: {
      const never: never = effect;
      return never;
    }
  }
}

// ── Issue ───────────────────────────────────────────────────────────────────

export interface IssueInput {
  deedVersionId: string | null;
  issuedOn: string;
  issuerTrusteeId: string;
  /** The prepared PDF, already stored. */
  pdf: { fieldsPrepared: boolean; objectKey: string; sha256: string };
  resolutionId: string;
  responseDueOn: string;
  /** Snapshot of the trustees in office at issue. */
  responders: { fieldName: string; trusteeId: string; userId: string | null }[];
  threshold: RegisterInput["rules"]["amendmentThreshold"];
}

/** Freezes a draft into revision 1 and opens a response per trustee. */
export async function issueResolution(input: IssueInput): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockResolution(tx, input.resolutionId);
    if (row.status !== "draft") {
      throw new ResolutionError("Only a draft can be issued.");
    }
    if (row.kind !== "circular") {
      throw new ResolutionError(
        "This resolution is on a meeting's agenda and is decided there."
      );
    }
    const now = new Date();
    const revisionId = uuidv7();
    await tx.insert(resolutionRevision).values({
      body: row.body,
      createdAt: now,
      fieldsPrepared: input.pdf.fieldsPrepared,
      id: revisionId,
      latestObjectKey: input.pdf.objectKey,
      latestSha256: input.pdf.sha256,
      objectKey: input.pdf.objectKey,
      resolutionId: row.id,
      revision: 1,
      sha256: input.pdf.sha256,
    });
    await tx.insert(resolutionResponse).values(
      input.responders.map((r) => ({
        fieldName: r.fieldName,
        id: uuidv7(),
        resolutionId: row.id,
        trusteeId: r.trusteeId,
        userId: r.userId,
      }))
    );
    await tx
      .update(resolution)
      .set({
        deedVersionId: input.deedVersionId,
        issuedAt: now,
        issuedByTrusteeId: input.issuerTrusteeId,
        responseDueOn: input.responseDueOn,
        status: "issued",
        threshold: input.threshold,
        updatedAt: now,
      })
      .where(eq(resolution.id, row.id));
  });
}

// ── Responses ───────────────────────────────────────────────────────────────

async function lockOpenResponse(
  tx: Tx,
  resolutionId: string,
  trusteeId: string
) {
  const row = await lockResolution(tx, resolutionId);
  if (row.status !== "issued") {
    throw new ResolutionError("This resolution is no longer open.");
  }
  const [response] = await tx
    .select()
    .from(resolutionResponse)
    .where(
      and(
        eq(resolutionResponse.resolutionId, resolutionId),
        eq(resolutionResponse.trusteeId, trusteeId)
      )
    )
    .for("update")
    .limit(1);
  if (!response) {
    throw new ResolutionError(
      "You weren't a trustee in office when this was issued."
    );
  }
  if (response.conflictDeclared) {
    throw new ResolutionError(
      "You declared a conflict of interest, so you can't respond."
    );
  }
  if (response.response !== "pending") {
    throw new ResolutionError("You have already responded.");
  }
  return { response, row };
}

export async function recordObjection(input: {
  reason: string;
  resolutionId: string;
  today: string;
  trusteeId: string;
}): Promise<Decision> {
  return await db.transaction(async (tx) => {
    const { response } = await lockOpenResponse(
      tx,
      input.resolutionId,
      input.trusteeId
    );
    await tx
      .update(resolutionResponse)
      .set({
        reason: input.reason,
        respondedAt: new Date(),
        response: "objection",
      })
      .where(eq(resolutionResponse.id, response.id));
    return await decideInTx(tx, input.resolutionId, input.today);
  });
}

export async function declareConflict(input: {
  note: string;
  resolutionId: string;
  today: string;
  trusteeId: string;
}): Promise<Decision> {
  return await db.transaction(async (tx) => {
    const { response } = await lockOpenResponse(
      tx,
      input.resolutionId,
      input.trusteeId
    );
    await tx
      .update(resolutionResponse)
      .set({
        conflictDeclared: true,
        conflictNote: input.note,
        respondedAt: new Date(),
      })
      .where(eq(resolutionResponse.id, response.id));
    return await decideInTx(tx, input.resolutionId, input.today);
  });
}

/** The PDF a signer must extend: the latest with every signature so far. */
export async function currentRevision(resolutionId: string) {
  const [row] = await db
    .select()
    .from(resolutionRevision)
    .where(eq(resolutionRevision.resolutionId, resolutionId))
    .orderBy(sql`${resolutionRevision.revision} desc`)
    .limit(1);
  return row ?? null;
}

export async function responseFor(resolutionId: string, trusteeId: string) {
  const [row] = await db
    .select()
    .from(resolutionResponse)
    .where(
      and(
        eq(resolutionResponse.resolutionId, resolutionId),
        eq(resolutionResponse.trusteeId, trusteeId)
      )
    )
    .limit(1);
  return row ?? null;
}

export interface SignatureInput {
  /** The sha256 of the PDF the signer extended; refuses a stale upload. */
  basedOnSha256: string;
  createdBy: string | null;
  method: "acrobat_upload" | "dsc_helper" | "esign";
  objectKey: string;
  resolutionId: string;
  sha256: string;
  signature: GovernanceValidationReport["signatures"][number];
  today: string;
  trusteeId: string;
}

/** Records a signed assent and moves the revision's latest PDF forward. */
export async function recordSignature(
  input: SignatureInput
): Promise<Decision> {
  return await db.transaction(async (tx) => {
    const { response } = await lockOpenResponse(
      tx,
      input.resolutionId,
      input.trusteeId
    );
    const [revision] = await tx
      .select()
      .from(resolutionRevision)
      .where(eq(resolutionRevision.resolutionId, input.resolutionId))
      .orderBy(sql`${resolutionRevision.revision} desc`)
      .for("update")
      .limit(1);
    if (!revision) {
      throw new ResolutionError("This resolution has no issued PDF.");
    }
    if (revision.latestSha256 !== input.basedOnSha256) {
      throw new ResolutionError(
        "Someone else signed while you were signing. Download the PDF again, sign it and upload it."
      );
    }
    const signatureId = uuidv7();
    const s = input.signature;
    await tx.insert(resolutionSignature).values({
      certificateSha256: s.sha256Fingerprint || null,
      createdAt: new Date(),
      createdBy: input.createdBy,
      fieldName: response.fieldName,
      id: signatureId,
      issuer: s.issuer || null,
      method: input.method,
      objectKey: input.objectKey,
      resolutionId: input.resolutionId,
      revisionId: revision.id,
      serial: s.serial || null,
      sha256: input.sha256,
      signerName: s.signerName,
      signingTime: s.signingTime ? new Date(s.signingTime) : null,
      timestamped: s.timestamped,
      trusted: s.trusted,
      trusteeId: input.trusteeId,
    });
    await tx
      .update(resolutionResponse)
      .set({ respondedAt: new Date(), response: "assent", signatureId })
      .where(eq(resolutionResponse.id, response.id));
    await tx
      .update(resolutionRevision)
      .set({ latestObjectKey: input.objectKey, latestSha256: input.sha256 })
      .where(eq(resolutionRevision.id, revision.id));
    return await decideInTx(tx, input.resolutionId, input.today);
  });
}

// ── Deciding ────────────────────────────────────────────────────────────────

export interface Decision {
  number: string | null;
  status: "issued" | "passed" | "failed";
  tally: Tally;
}

async function nextSequence(tx: Tx, fiscalYear: string): Promise<number> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`resolution_number:${fiscalYear}`}, 0))`
  );
  const [row] = await tx
    .select({ last: max(resolution.sequence) })
    .from(resolution)
    .where(eq(resolution.fiscalYear, fiscalYear));
  return (row?.last ?? 0) + 1;
}

/**
 * Counts the responses and, when the outcome is settled, passes the
 * resolution (number, register effect) or fails it, in the caller's
 * transaction. An effect the register can no longer take fails it with the
 * reason, rather than leaving the register inconsistent.
 */
async function decideInTx(
  tx: Tx,
  resolutionId: string,
  today: string
): Promise<Decision> {
  const row = await lockResolution(tx, resolutionId);
  const responses = await tx
    .select({
      conflictDeclared: resolutionResponse.conflictDeclared,
      response: resolutionResponse.response,
      signatureId: resolutionResponse.signatureId,
      trusteeId: resolutionResponse.trusteeId,
    })
    .from(resolutionResponse)
    .where(eq(resolutionResponse.resolutionId, resolutionId));
  const tally = tallyCircular({
    dueOn: row.responseDueOn ?? today,
    responses: responses.map((r): ResponseState => ({
      conflictDeclared: r.conflictDeclared,
      response: r.response,
      signed: r.signatureId !== null,
      trusteeId: r.trusteeId,
    })),
    subjectTrusteeId: effectSubject(row.effect),
    threshold: row.threshold ?? "majority_in_office",
    today,
  });
  if (row.status !== "issued" || tally.outcome === "open") {
    return {
      number: row.number,
      status: row.status === "issued" ? "issued" : (row.status as "passed"),
      tally,
    };
  }
  if (tally.outcome === "failed") {
    await failInTx(tx, resolutionId, today, tally.reason);
    return { number: null, status: "failed", tally };
  }
  const passed = await passInTx(tx, row, today);
  if (passed.status === "failed") {
    return {
      number: null,
      status: "failed",
      tally: { ...tally, reason: passed.note },
    };
  }
  return { number: passed.number, status: "passed", tally };
}

/** Marks a resolution failed with the reason, in the caller's transaction. */
export async function failInTx(
  tx: Tx,
  resolutionId: string,
  today: string,
  note: string | null
): Promise<void> {
  const now = new Date();
  await tx
    .update(resolution)
    .set({
      decidedAt: now,
      decidedOn: today,
      outcomeNote: note,
      status: "failed",
      updatedAt: now,
    })
    .where(eq(resolution.id, resolutionId));
}

/**
 * Passes a resolution in the caller's transaction: the next number in its
 * financial year and its register change. A change the register can no
 * longer take fails it with the reason instead.
 */
export async function passInTx(
  tx: Tx,
  row: typeof resolution.$inferSelect,
  today: string
): Promise<
  { number: string; status: "passed" } | { note: string; status: "failed" }
> {
  const register = await loadRegister(tx, today);
  const problem = effectRegisterProblem(register, row.effect);
  if (problem) {
    const note = `Enough trustees agreed, but the register change can't be made: ${problem}`;
    await failInTx(tx, row.id, today, note);
    return { note, status: "failed" };
  }
  const now = new Date();
  const fiscalYear = financialYearOf(today).label;
  const sequence = await nextSequence(tx, fiscalYear);
  const number = formatResolutionNumber(fiscalYear, sequence);
  await applyEffect(tx, row.id, row.effect, null);
  await tx
    .update(resolution)
    .set({
      decidedAt: now,
      decidedOn: today,
      fiscalYear,
      number,
      outcomeNote: null,
      sequence,
      status: "passed",
      updatedAt: now,
    })
    .where(eq(resolution.id, row.id));
  return { number, status: "passed" };
}

/** Settles a resolution whose outcome is due (the closing job, and after each response). */
export async function decideResolution(
  resolutionId: string,
  today: string
): Promise<Decision> {
  return await db.transaction((tx) => decideInTx(tx, resolutionId, today));
}

/** Issued resolutions whose response date has passed. */
export async function overdueResolutionIds(today: string): Promise<string[]> {
  const rows = await db
    .select({ id: resolution.id })
    .from(resolution)
    .where(
      and(
        eq(resolution.status, "issued"),
        sql`${resolution.responseDueOn} < ${today}`
      )
    );
  return rows.map((r) => r.id);
}

export async function withdrawResolution(input: {
  reason: string;
  resolutionId: string;
  today: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await lockResolution(tx, input.resolutionId);
    if (row.status !== "issued") {
      throw new ResolutionError("Only an issued resolution can be withdrawn.");
    }
    const now = new Date();
    await tx
      .update(resolution)
      .set({
        decidedAt: now,
        decidedOn: input.today,
        outcomeNote: input.reason,
        status: "withdrawn",
        updatedAt: now,
      })
      .where(eq(resolution.id, input.resolutionId));
  });
}

/**
 * Links the vault copy of the final signed PDF, and makes it the evidence
 * for the register entries the resolution started or ended.
 */
export async function setFinalDocument(
  resolutionId: string,
  documentId: string
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date();
    await tx
      .update(resolution)
      .set({ finalDocumentId: documentId, updatedAt: now })
      .where(eq(resolution.id, resolutionId));
    for (const table of [trusteeTerm, trusteeOffice] as const) {
      await tx
        .update(table)
        .set({ startEvidenceDocumentId: documentId, updatedAt: now })
        .where(
          and(
            eq(table.sourceResolutionId, resolutionId),
            isNull(table.startEvidenceDocumentId),
            isNull(table.endedOn)
          )
        );
      await tx
        .update(table)
        .set({ endEvidenceDocumentId: documentId, updatedAt: now })
        .where(
          and(
            eq(table.sourceResolutionId, resolutionId),
            isNull(table.endEvidenceDocumentId),
            sql`${table.endedOn} IS NOT NULL`
          )
        );
    }
  });
}

/** People to tell about a resolution: the trustees it went to, with accounts. */
export async function resolutionRecipients(resolutionId: string) {
  return await db
    .select({
      legalName: trustee.legalName,
      response: resolutionResponse.response,
      trusteeId: resolutionResponse.trusteeId,
      userId: resolutionResponse.userId,
    })
    .from(resolutionResponse)
    .innerJoin(trustee, eq(trustee.id, resolutionResponse.trusteeId))
    .where(eq(resolutionResponse.resolutionId, resolutionId));
}

// ── History ─────────────────────────────────────────────────────────────────

export interface HistoricalResolutionInput {
  decidedOn: string;
  documentId: string | null;
  draftedBy: string;
  id: string;
  number: string;
  fiscalYear: string;
  sequence: number;
  templateKey: (typeof resolution.$inferInsert)["templateKey"];
  title: string;
  validityNote: string | null;
}

/**
 * A resolution passed on paper before pi-dash, recorded with its number so
 * the series continues. It makes no register change: the register's own
 * entries carry that history with their evidence.
 */
export async function recordHistoricalResolution(
  input: HistoricalResolutionInput
): Promise<void> {
  const now = new Date();
  try {
    await db.insert(resolution).values({
      body: "",
      createdAt: now,
      decidedAt: now,
      decidedOn: input.decidedOn,
      draftedBy: input.draftedBy,
      effect: { type: "none" },
      finalDocumentId: input.documentId,
      fiscalYear: input.fiscalYear,
      historical: true,
      id: input.id,
      number: input.number,
      sequence: input.sequence,
      status: "passed",
      templateKey: input.templateKey,
      title: input.title,
      updatedAt: now,
      validityNote: input.validityNote,
    });
  } catch (error) {
    if (
      String(error).includes("resolution_number_uidx") ||
      String(error).includes("resolution_fy_sequence_uidx")
    ) {
      throw new ResolutionError(`${input.number} is already in the register.`);
    }
    throw error;
  }
}
