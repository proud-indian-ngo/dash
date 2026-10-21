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
  answersText,
  type CircularAnswer,
  effectSubject,
  formatResolutionNumber,
  officesEndedBy,
  type ResolutionEffect,
  type ResponseState,
  responseDatePassed,
  type Tally,
  tallyCircular,
  termEndedBy,
} from "@pi-dash/shared/resolutions";
import {
  plainTextToRichText,
  serializeRichText,
} from "@pi-dash/shared/rich-text";
import { and, asc, desc, eq, inArray, isNull, max, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  circular,
  circularRevision,
  circularSignature,
  deedVersion,
  type GovernanceValidationReport,
  resolution,
  resolutionResponse,
  trustee,
  trusteeOffice,
  trusteeTerm,
} from "../schema/governance";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<typeof db, "select">;

export class ResolutionError extends Error {}

/**
 * Serialises every write that could break the register's rules (a trustee's
 * overlapping terms, two holders of an office, an office outside its
 * holder's term): each takes this lock before it reads the register to
 * check the change, so two checks never pass against the same register.
 */
export async function lockRegister(tx: Pick<Tx, "execute">): Promise<void> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('governance_register', 0))`
  );
}

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

/**
 * Locks a resolution's row. Issuing, deciding and editing a draft take it,
 * after any meeting or circular lock and before the register's.
 */
export async function lockResolution(tx: Executor, id: string) {
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
      const ended = termEndedBy(
        register.terms,
        effect.trusteeId,
        effect.endedOn
      );
      const offices = new Set(officesEndedBy(register, effect));
      return {
        ...register,
        offices: register.offices.map((o) =>
          offices.has(o.id) ? { ...o, endedOn: effect.endedOn } : o
        ),
        terms: register.terms.map((t) =>
          t.id === ended?.id ? { ...t, endedOn: effect.endedOn } : t
        ),
      };
    }
    case "office_start": {
      const ended = new Set(officesEndedBy(register, effect));
      return {
        ...register,
        offices: [
          ...register.offices.map((o) =>
            ended.has(o.id) ? { ...o, endedOn: effect.startsOn } : o
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
    }
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
  if (
    (effect.type === "term_end" || effect.type === "removal") &&
    !termEndedBy(register.terms, effect.trusteeId, effect.endedOn)
  ) {
    return register.terms.some(
      (t) => t.trusteeId === effect.trusteeId && t.endedOn === null
    )
      ? "The cessation date must come after the term started."
      : "That trustee has no open term to end.";
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
  documentId: string | null,
  /** The register the effect was checked against. */
  register: RegisterInput
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
      const ended = termEndedBy(
        register.terms,
        effect.trusteeId,
        effect.endedOn
      );
      if (!ended) {
        throw new ResolutionError("That trustee has no open term to end.");
      }
      const offices = officesEndedBy(register, effect);
      if (offices.length > 0) {
        await tx
          .update(trusteeOffice)
          .set({
            endEvidenceDocumentId: documentId,
            endedOn: effect.endedOn,
            endSourceResolutionId: resolutionId,
            updatedAt: now,
          })
          .where(inArray(trusteeOffice.id, offices));
      }
      await tx
        .update(trusteeTerm)
        .set({
          cessationBasis,
          endEvidenceDocumentId: documentId,
          endedOn: effect.endedOn,
          endSourceResolutionId: resolutionId,
          updatedAt: now,
        })
        .where(eq(trusteeTerm.id, ended.id));
      return;
    }
    case "office_start": {
      const ended = officesEndedBy(register, effect);
      if (ended.length > 0) {
        await tx
          .update(trusteeOffice)
          .set({
            endEvidenceDocumentId: documentId,
            endedOn: effect.startsOn,
            endSourceResolutionId: resolutionId,
            updatedAt: now,
          })
          .where(inArray(trusteeOffice.id, ended));
      }
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
    }
    default: {
      const never: never = effect;
      return never;
    }
  }
}

// ── Issue ───────────────────────────────────────────────────────────────────

export interface IssueInput {
  circularId: string;
  deedVersionId: string | null;
  issuerTrusteeId: string;
  /** The prepared PDF, already stored. */
  pdf: { fieldsPrepared: boolean; objectKey: string; sha256: string };
  /**
   * The drafts it carries, in order, each with the threshold it passes by
   * and the `updatedAt` the PDF was rendered from.
   */
  resolutions: {
    id: string;
    renderedFrom: Date;
    threshold: RegisterInput["rules"]["amendmentThreshold"];
  }[];
  responseDueOn: string;
  /** Snapshot of the trustees in office at issue. */
  responders: { fieldName: string; trusteeId: string; userId: string | null }[];
  /**
   * Whether the register, read again under its lock, still gives the deed,
   * issuer, signers and thresholds the PDF was rendered with.
   */
  stillPlanned: (register: Awaited<ReturnType<typeof loadRegister>>) => boolean;
  today: string;
}

/**
 * Freezes the drafts into one circular with its PDF as revision 1, and
 * opens a response per trustee on each of them.
 */
export async function issueCircular(input: IssueInput): Promise<void> {
  await db.transaction(async (tx) => {
    // In id order, so two issues sharing drafts lock them in the same order.
    const byId = [...input.resolutions].sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    for (const item of byId) {
      const row = await lockResolution(tx, item.id);
      if (row.status !== "draft") {
        throw new ResolutionError(`"${row.title}" is no longer a draft.`);
      }
      if (row.kind !== "circular") {
        throw new ResolutionError(
          `"${row.title}" is on a meeting's agenda and is decided there.`
        );
      }
      if (row.updatedAt.getTime() !== item.renderedFrom.getTime()) {
        throw new ResolutionError(
          `"${row.title}" was edited while the circular was being issued. Issue it again.`
        );
      }
    }
    await lockRegister(tx);
    const register = await loadRegister(tx, input.today);
    if (!input.stillPlanned(register)) {
      throw new ResolutionError(
        "The board changed while the circular was being prepared. Issue it again."
      );
    }
    const now = new Date();
    await tx.insert(circular).values({
      createdAt: now,
      id: input.circularId,
      issuedAt: now,
      issuedByTrusteeId: input.issuerTrusteeId,
      responseDueOn: input.responseDueOn,
      updatedAt: now,
    });
    await tx.insert(circularRevision).values({
      circularId: input.circularId,
      createdAt: now,
      fieldsPrepared: input.pdf.fieldsPrepared,
      id: uuidv7(),
      latestObjectKey: input.pdf.objectKey,
      latestSha256: input.pdf.sha256,
      objectKey: input.pdf.objectKey,
      revision: 1,
      sha256: input.pdf.sha256,
    });
    for (const [index, item] of input.resolutions.entries()) {
      await tx.insert(resolutionResponse).values(
        input.responders.map((r) => ({
          fieldName: r.fieldName,
          id: uuidv7(),
          resolutionId: item.id,
          trusteeId: r.trusteeId,
          userId: r.userId,
        }))
      );
      await tx
        .update(resolution)
        .set({
          circularId: input.circularId,
          deedVersionId: input.deedVersionId,
          position: index + 1,
          status: "issued",
          threshold: item.threshold,
          updatedAt: now,
        })
        .where(eq(resolution.id, item.id));
    }
  });
}

export async function getCircular(id: string) {
  const [row] = await db
    .select()
    .from(circular)
    .where(eq(circular.id, id))
    .limit(1);
  return row ?? null;
}

/** A circular's resolutions in order. */
export async function circularResolutions(circularId: string) {
  return await db
    .select()
    .from(resolution)
    .where(eq(resolution.circularId, circularId))
    .orderBy(asc(resolution.position));
}

// ── Responses ───────────────────────────────────────────────────────────────

/**
 * Every write to a circular locks its row first, then its resolutions, then
 * responses, so signatures, objections, withdrawal and closing serialise
 * per circular without deadlocking.
 */
async function lockCircular(tx: Tx, circularId: string) {
  const [row] = await tx
    .select()
    .from(circular)
    .where(eq(circular.id, circularId))
    .for("update")
    .limit(1);
  if (!row) {
    throw new ResolutionError("Circular not found");
  }
  return row;
}

/** Under the circular's lock, so a response can't land after the closing job. */
function assertResponseDateOpen(
  row: typeof circular.$inferSelect,
  today: string
) {
  if (responseDatePassed(row.responseDueOn, today)) {
    throw new ResolutionError(
      "The response date has passed, so responses are closed."
    );
  }
}

async function lockOpenResponse(
  tx: Tx,
  resolutionId: string,
  trusteeId: string,
  today: string
) {
  const [owner] = await tx
    .select({ circularId: resolution.circularId })
    .from(resolution)
    .where(eq(resolution.id, resolutionId))
    .limit(1);
  if (owner?.circularId) {
    assertResponseDateOpen(await lockCircular(tx, owner.circularId), today);
  }
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
}): Promise<Decision[]> {
  return await db.transaction(async (tx) => {
    const { response, row } = await lockOpenResponse(
      tx,
      input.resolutionId,
      input.trusteeId,
      input.today
    );
    await tx
      .update(resolutionResponse)
      .set({
        reason: input.reason,
        respondedAt: new Date(),
        response: "objection",
      })
      .where(eq(resolutionResponse.id, response.id));
    return await settleAfterResponse(tx, row, input.today);
  });
}

export async function declareConflict(input: {
  note: string;
  resolutionId: string;
  today: string;
  trusteeId: string;
}): Promise<Decision[]> {
  return await db.transaction(async (tx) => {
    const { response, row } = await lockOpenResponse(
      tx,
      input.resolutionId,
      input.trusteeId,
      input.today
    );
    await tx
      .update(resolutionResponse)
      .set({
        conflictDeclared: true,
        conflictNote: input.note,
        respondedAt: new Date(),
      })
      .where(eq(resolutionResponse.id, response.id));
    return await settleAfterResponse(tx, row, input.today);
  });
}

/** A response can settle more than its own resolution: the ones held behind it. */
function settleAfterResponse(
  tx: Tx,
  row: typeof resolution.$inferSelect,
  today: string
): Promise<Decision[]> {
  return row.circularId
    ? decideCircularInTx(tx, row.circularId, today)
    : decideInTx(tx, row.id, today, false).then((d) => [d]);
}

/** The PDF a signer must extend: the latest with every signature so far. */
export async function currentRevision(circularId: string) {
  const [row] = await db
    .select()
    .from(circularRevision)
    .where(eq(circularRevision.circularId, circularId))
    .orderBy(desc(circularRevision.revision))
    .limit(1);
  return row ?? null;
}

export interface SignerState {
  /** Each resolution's answer as their signature would give it now. */
  answers: { answer: CircularAnswer; position: number }[];
  fieldName: string;
  /** Resolutions still open and waiting for them: what signing assents to. */
  openAssents: number;
}

/**
 * Where a trustee stands on a circular: null if it didn't go to them.
 * Signing assents to every resolution they haven't objected to or declared
 * a conflict on.
 */
export async function signerState(
  executor: Executor,
  circularId: string,
  trusteeId: string
): Promise<SignerState | null> {
  const rows = await executor
    .select({
      conflictDeclared: resolutionResponse.conflictDeclared,
      fieldName: resolutionResponse.fieldName,
      position: resolution.position,
      response: resolutionResponse.response,
      status: resolution.status,
    })
    .from(resolutionResponse)
    .innerJoin(resolution, eq(resolution.id, resolutionResponse.resolutionId))
    .where(
      and(
        eq(resolution.circularId, circularId),
        eq(resolutionResponse.trusteeId, trusteeId)
      )
    );
  const [first] = rows;
  if (!first) {
    return null;
  }
  const answers = rows.map((r) => ({
    answer: answerOf(r),
    position: r.position ?? 0,
  }));
  return {
    answers,
    fieldName: first.fieldName,
    openAssents: rows.filter(
      (r) =>
        r.status === "issued" && r.response === "pending" && !r.conflictDeclared
    ).length,
  };
}

/**
 * What a trustee's signature would say about one resolution: a resolution
 * decided while they were still pending isn't assented to.
 */
function answerOf(r: {
  conflictDeclared: boolean;
  response: string;
  status: string;
}): CircularAnswer {
  if (r.conflictDeclared) {
    return "conflict";
  }
  if (r.response === "objection") {
    return "objection";
  }
  return r.response === "pending" && r.status !== "issued"
    ? "decided"
    : "assent";
}

export interface SignatureInput {
  /** The answers filled into the PDF the trustee signed. */
  answers: string;
  /** The sha256 of the PDF the signer extended; refuses a stale upload. */
  basedOnSha256: string;
  circularId: string;
  createdBy: string | null;
  method: "acrobat_upload" | "dsc_helper";
  objectKey: string;
  sha256: string;
  signature: GovernanceValidationReport["signatures"][number];
  today: string;
  trusteeId: string;
}

/**
 * Records a trustee's signature on a circular: it assents to every
 * resolution they hadn't objected to or declared a conflict on, as the
 * answers in the signed PDF say. Moves the latest PDF forward and settles
 * whatever is now decided, in order.
 */
export async function recordSignature(
  input: SignatureInput
): Promise<Decision[]> {
  return await db.transaction(async (tx) => {
    assertResponseDateOpen(
      await lockCircular(tx, input.circularId),
      input.today
    );
    const state = await signerState(tx, input.circularId, input.trusteeId);
    if (!state) {
      throw new ResolutionError(
        "You weren't a trustee in office when this was issued."
      );
    }
    if (state.openAssents === 0) {
      throw new ResolutionError(
        "There's nothing left for you to sign on this circular."
      );
    }
    if (answersText(state.answers) !== input.answers) {
      throw new ResolutionError(
        "Your answers changed while you were signing. Start again to sign them as they are now."
      );
    }
    const [revision] = await tx
      .select()
      .from(circularRevision)
      .where(eq(circularRevision.circularId, input.circularId))
      .orderBy(desc(circularRevision.revision))
      .for("update")
      .limit(1);
    if (!revision) {
      throw new ResolutionError("This circular has no issued PDF.");
    }
    if (revision.latestSha256 !== input.basedOnSha256) {
      throw new ResolutionError(
        "Someone else signed while you were signing. Download the PDF again, sign it and upload it."
      );
    }
    const signatureId = uuidv7();
    const s = input.signature;
    const now = new Date();
    await tx.insert(circularSignature).values({
      answers: input.answers,
      certificateSha256: s.sha256Fingerprint || null,
      circularId: input.circularId,
      createdAt: now,
      createdBy: input.createdBy,
      fieldName: state.fieldName,
      id: signatureId,
      issuer: s.issuer || null,
      method: input.method,
      objectKey: input.objectKey,
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
      .set({ respondedAt: now, response: "assent", signatureId })
      .where(
        and(
          eq(resolutionResponse.trusteeId, input.trusteeId),
          eq(resolutionResponse.response, "pending"),
          eq(resolutionResponse.conflictDeclared, false),
          inArray(
            resolutionResponse.resolutionId,
            tx
              .select({ id: resolution.id })
              .from(resolution)
              .where(
                and(
                  eq(resolution.circularId, input.circularId),
                  eq(resolution.status, "issued")
                )
              )
          )
        )
      );
    await tx
      .update(circularRevision)
      .set({ latestObjectKey: input.objectKey, latestSha256: input.sha256 })
      .where(eq(circularRevision.id, revision.id));
    return await decideCircularInTx(tx, input.circularId, input.today);
  });
}

// ── Deciding ────────────────────────────────────────────────────────────────

export interface Decision {
  number: string | null;
  resolutionId: string;
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
 * Counts a resolution's responses and, when the outcome is settled, passes
 * it (number, register effect) or fails it, in the caller's transaction. An
 * effect the register can no longer take fails it with the reason, rather
 * than leaving the register inconsistent.
 */
async function decideInTx(
  tx: Tx,
  resolutionId: string,
  today: string,
  /** An earlier resolution in the circular is still open. */
  earlierOpen: boolean
): Promise<Decision> {
  const row = await lockResolution(tx, resolutionId);
  const [issue] = row.circularId
    ? await tx
        .select({ responseDueOn: circular.responseDueOn })
        .from(circular)
        .where(eq(circular.id, row.circularId))
        .limit(1)
    : [];
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
    dueOn: issue?.responseDueOn ?? today,
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
      resolutionId,
      status: row.status === "issued" ? "issued" : (row.status as "passed"),
      tally,
    };
  }
  if (tally.outcome === "failed") {
    await failInTx(tx, resolutionId, today, tally.reason);
    return { number: null, resolutionId, status: "failed", tally };
  }
  // A designation that needs the appointment before it waits for that
  // appointment to be decided, rather than failing on the register now.
  if (
    earlierOpen &&
    effectRegisterProblem(await loadRegister(tx, today), row.effect)
  ) {
    return { number: null, resolutionId, status: "issued", tally };
  }
  const passed = await passInTx(tx, row, today);
  if (passed.status === "failed") {
    return {
      number: null,
      resolutionId,
      status: "failed",
      tally: { ...tally, reason: passed.note },
    };
  }
  return { number: passed.number, resolutionId, status: "passed", tally };
}

/**
 * Settles each of a circular's open resolutions that can be, in order. The
 * caller holds the circular's lock.
 */
async function decideCircularInTx(
  tx: Tx,
  circularId: string,
  today: string
): Promise<Decision[]> {
  const rows = await tx
    .select({ id: resolution.id })
    .from(resolution)
    .where(
      and(
        eq(resolution.circularId, circularId),
        eq(resolution.status, "issued")
      )
    )
    .orderBy(asc(resolution.position));
  const decisions: Decision[] = [];
  for (const row of rows) {
    const earlierOpen = decisions.some((d) => d.status === "issued");
    decisions.push(await decideInTx(tx, row.id, today, earlierOpen));
  }
  return decisions;
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
  await lockRegister(tx);
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
  await applyEffect(tx, row.id, row.effect, null, register);
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

/**
 * Settles a circular's resolutions whose outcome is due (the closing job).
 * `then` runs in the same transaction, so what it writes commits with the
 * decisions or not at all.
 */
export async function decideCircular(
  circularId: string,
  today: string,
  then: (tx: Tx, decisions: Decision[]) => Promise<void>
): Promise<Decision[]> {
  return await db.transaction(async (tx) => {
    await lockCircular(tx, circularId);
    const decisions = await decideCircularInTx(tx, circularId, today);
    await then(tx, decisions);
    return decisions;
  });
}

/** Circulars with an open resolution whose response date has passed. */
export async function overdueCircularIds(today: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: circular.id, issuedAt: circular.issuedAt })
    .from(circular)
    .innerJoin(resolution, eq(resolution.circularId, circular.id))
    .where(
      and(
        eq(resolution.status, "issued"),
        sql`${circular.responseDueOn} < ${today}`
      )
    )
    .orderBy(asc(circular.issuedAt));
  return rows.map((r) => r.id);
}

/** Withdraws every resolution of the circular still open; returns their IDs. */
export async function withdrawCircular(input: {
  circularId: string;
  reason: string;
  today: string;
}): Promise<string[]> {
  return await db.transaction(async (tx) => {
    await lockCircular(tx, input.circularId);
    const open = await tx
      .select({ id: resolution.id })
      .from(resolution)
      .where(
        and(
          eq(resolution.circularId, input.circularId),
          eq(resolution.status, "issued")
        )
      )
      .orderBy(asc(resolution.position))
      .for("update");
    if (open.length === 0) {
      throw new ResolutionError(
        "Every resolution in this circular is already decided."
      );
    }
    const now = new Date();
    const ids = open.map((r) => r.id);
    await tx
      .update(resolution)
      .set({
        decidedAt: now,
        decidedOn: input.today,
        outcomeNote: input.reason,
        status: "withdrawn",
        updatedAt: now,
      })
      .where(inArray(resolution.id, ids));
    return ids;
  });
}

/**
 * Links the vault copy of the final signed PDF, and makes it the evidence
 * for the register entries the resolution started or ended.
 */
export async function setFinalDocument(
  resolutionId: string,
  documentId: string,
  executor: typeof db | Tx = db
): Promise<void> {
  await executor.transaction(async (tx) => {
    await lockRegister(tx);
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
            isNull(table.startEvidenceDocumentId)
          )
        );
      await tx
        .update(table)
        .set({ endEvidenceDocumentId: documentId, updatedAt: now })
        .where(
          and(
            eq(table.endSourceResolutionId, resolutionId),
            isNull(table.endEvidenceDocumentId),
            sql`${table.endedOn} IS NOT NULL`
          )
        );
    }
  });
}

/** The trustees a circular went to, with their accounts. */
export async function circularRecipients(circularId: string) {
  return await db
    .selectDistinct({
      legalName: trustee.legalName,
      trusteeId: resolutionResponse.trusteeId,
      userId: resolutionResponse.userId,
    })
    .from(resolutionResponse)
    .innerJoin(trustee, eq(trustee.id, resolutionResponse.trusteeId))
    .innerJoin(resolution, eq(resolution.id, resolutionResponse.resolutionId))
    .where(eq(resolution.circularId, circularId));
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
      body: serializeRichText(plainTextToRichText("")),
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
