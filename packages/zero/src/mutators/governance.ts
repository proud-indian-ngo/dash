import {
  COMPLIANCE_NOTE_MAX,
  COMPLIANCE_TITLE_MAX,
  fiscalYearLabel,
} from "@pi-dash/shared/compliance";
import { organisationRegistrationTypeValues } from "@pi-dash/shared/constants";
import {
  castingVoteRuleValues,
  DOCUMENT_TITLE_MAX,
  governanceDocumentKindValues,
  newRegisterProblems,
  type OfficeRow,
  officeDateProblem,
  quorumKindValues,
  type RegisterInput,
  resolutionThresholdValues,
  type TermRow,
  termDateProblem,
  trusteeCessationBasisValues,
  trusteeOfficeValues,
  trusteeTermBasisValues,
  VALIDITY_NOTE_MAX,
} from "@pi-dash/shared/governance";
import {
  RESOLUTION_EFFECT_VALUES,
  RESOLUTION_TEMPLATES,
  RESOLUTION_TEXT_MAX,
  RESOLUTION_TITLE_MAX,
  resolutionTemplateKeyValues,
} from "@pi-dash/shared/resolutions";
import { defineMutator, type Transaction } from "@rocicorp/zero";
import z from "zod";

import "../context";
import type { Context } from "../context";
import { assertHasPermission, assertIsLoggedIn, can } from "../permissions";
import { type Schema, zql } from "../schema";
import {
  type LockableKalakritiTx,
  requireServerTransaction,
} from "./kalakriti-row-locks";

/**
 * Register writes. Terms and offices sync through Zero, so they change here;
 * a trustee's identity and private details go through the `saveTrustee`
 * server function, and vault files through `createGovernanceDocument`.
 * Every write refuses a change that would give an office two holders, put an
 * office outside its holder's term, or give a trustee overlapping terms, and
 * takes the register lock first so concurrent writes are checked in turn.
 */

type Tx = Transaction<Schema>;

const isoDate = z.iso.date();
const note = z.string().trim().max(VALIDITY_NOTE_MAX).nullable().optional();
const documentId = z.string().nullable().optional();

/** Zero stores Postgres `date` columns as epoch milliseconds at UTC midnight. */
function toEpoch(value: string): number;
function toEpoch(value: string | null | undefined): number | null;
function toEpoch(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00Z`).getTime();
}

function toIso(value: number): string;
function toIso(value: number | null | undefined): string | null;
function toIso(value: number | null | undefined): string | null {
  return value === null || value === undefined
    ? null
    : new Date(value).toISOString().slice(0, 10);
}

type TermZ = {
  basis: TermRow["basis"];
  endedOn: number | null;
  endEvidenceDocumentId: string | null;
  endsOn: number | null;
  id: string;
  startEvidenceDocumentId: string | null;
  startsOn: number;
  trusteeId: string;
};

type OfficeZ = {
  endedOn: number | null;
  endEvidenceDocumentId: string | null;
  id: string;
  office: OfficeRow["office"];
  startEvidenceDocumentId: string | null;
  startsOn: number;
  trusteeId: string;
};

function termRow(t: TermZ): TermRow {
  return {
    basis: t.basis,
    endEvidenceDocumentId: t.endEvidenceDocumentId,
    endedOn: toIso(t.endedOn),
    endsOn: toIso(t.endsOn),
    id: t.id,
    startEvidenceDocumentId: t.startEvidenceDocumentId,
    startsOn: toIso(t.startsOn),
    trusteeId: t.trusteeId,
  };
}

function officeRow(o: OfficeZ): OfficeRow {
  return {
    endEvidenceDocumentId: o.endEvidenceDocumentId,
    endedOn: toIso(o.endedOn),
    id: o.id,
    office: o.office,
    startEvidenceDocumentId: o.startEvidenceDocumentId,
    startsOn: toIso(o.startsOn),
    trusteeId: o.trusteeId,
  };
}

async function loadRegister(tx: Tx): Promise<RegisterInput> {
  const [trustees, terms, offices, deed] = await Promise.all([
    tx.run(zql.trustee),
    tx.run(zql.trusteeTerm),
    tx.run(zql.trusteeOffice),
    tx.run(zql.deedVersion.orderBy("number", "desc").one()),
  ]);
  return {
    offices: offices.map((o) => officeRow(o as OfficeZ)),
    rules: {
      amendmentThreshold: deed?.amendmentThreshold ?? "two_thirds_in_office",
      castingVote: deed?.castingVote ?? "chair",
      circularIssuers: deed?.circularIssuers ?? ["managing_trustee"],
      coOptionMaxYears: deed?.coOptionMaxYears ?? 3,
      electronicCirculation: deed?.electronicCirculation ?? false,
      maxTrustees: deed?.maxTrustees ?? 9,
      minTrustees: deed?.minTrustees ?? 2,
      noticeDays: deed?.noticeDays ?? 7,
      quorumFloor: deed?.quorumFloor ?? 5,
      quorumKind: deed?.quorumKind ?? "fixed",
      quorumRequiredOffice: deed?.quorumRequiredOffice ?? null,
      quorumValue: deed?.quorumValue ?? 5,
      videoCountsPresent: deed?.videoCountsPresent ?? false,
    },
    terms: terms.map((t) => termRow(t as TermZ)),
    trustees: trustees.map((t) => ({
      id: t.id,
      isCoFounder: t.isCoFounder ?? false,
      legalName: t.legalName,
    })),
  };
}

/**
 * On the server, the lock every register write takes (`lockRegister` in
 * @pi-dash/db), before anything is read for the check.
 */
async function lockRegister(tx: Tx): Promise<void> {
  if (tx.location !== "server") {
    return;
  }
  const { lockRegister: lock } =
    await import("@pi-dash/db/queries/resolutions");
  await lock(requireServerTransaction(tx as unknown as LockableKalakritiTx));
}

function assertNoNewProblems(before: RegisterInput, after: RegisterInput) {
  const [problem] = newRegisterProblems(before, after);
  if (problem) {
    throw new Error(problem);
  }
}

async function requireTrustee(tx: Tx, trusteeId: string) {
  const trustee = await tx.run(zql.trustee.where("id", trusteeId).one());
  if (!trustee) {
    throw new Error("Trustee not found");
  }
  return trustee;
}

async function assertDocumentsExist(
  tx: Tx,
  ids: (string | null | undefined)[]
): Promise<void> {
  for (const id of ids) {
    if (id && !(await tx.run(zql.governanceDocument.where("id", id).one()))) {
      throw new Error("The evidence document isn't in the vault");
    }
  }
}

// ── Terms ───────────────────────────────────────────────────────────────────

const termFields = {
  acceptanceDocumentId: documentId,
  basis: z.enum(trusteeTermBasisValues),
  endsOn: isoDate.nullable().optional(),
  startEvidenceDocumentId: documentId,
  startsOn: isoDate,
  validityNote: note,
};

const termCreateInput = z.object({
  ...termFields,
  id: z.string(),
  trusteeId: z.string(),
});

const termUpdateInput = z.object({
  ...termFields,
  cessationBasis: z.enum(trusteeCessationBasisValues).nullable().optional(),
  endEvidenceDocumentId: documentId,
  endedOn: isoDate.nullable().optional(),
  id: z.string(),
});

const termEndInput = z.object({
  cessationBasis: z.enum(trusteeCessationBasisValues),
  endEvidenceDocumentId: documentId,
  endedOn: isoDate,
  id: z.string(),
  validityNote: note,
});

async function requireTerm(tx: Tx, id: string) {
  const term = await tx.run(zql.trusteeTerm.where("id", id).one());
  if (!term) {
    throw new Error("Term not found");
  }
  return term;
}

export const trusteeTermMutators = {
  create: defineMutator(termCreateInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    await lockRegister(tx);
    await requireTrustee(tx, args.trusteeId);
    const dateProblem = termDateProblem({
      endedOn: null,
      endsOn: args.endsOn ?? null,
      startsOn: args.startsOn,
    });
    if (dateProblem) {
      throw new Error(dateProblem);
    }
    await assertDocumentsExist(tx, [
      args.startEvidenceDocumentId,
      args.acceptanceDocumentId,
    ]);
    const before = await loadRegister(tx);
    const row: TermRow = {
      basis: args.basis,
      endEvidenceDocumentId: null,
      endedOn: null,
      endsOn: args.endsOn ?? null,
      id: args.id,
      startEvidenceDocumentId: args.startEvidenceDocumentId ?? null,
      startsOn: args.startsOn,
      trusteeId: args.trusteeId,
    };
    assertNoNewProblems(before, { ...before, terms: [...before.terms, row] });
    const now = Date.now();
    await tx.mutate.trusteeTerm.insert({
      acceptanceDocumentId: args.acceptanceDocumentId ?? null,
      basis: args.basis,
      cessationBasis: null,
      createdAt: now,
      endEvidenceDocumentId: null,
      endedOn: null,
      endsOn: toEpoch(args.endsOn),
      id: args.id,
      startEvidenceDocumentId: args.startEvidenceDocumentId ?? null,
      startsOn: toEpoch(args.startsOn),
      trusteeId: args.trusteeId,
      updatedAt: now,
      validityNote: args.validityNote ?? null,
    });
  }),

  /** Corrects a term: any field, including its end, for records entered wrongly. */
  update: defineMutator(termUpdateInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    await lockRegister(tx);
    const existing = await requireTerm(tx, args.id);
    const endedOn =
      args.endedOn === undefined ? toIso(existing.endedOn) : args.endedOn;
    const cessationBasis =
      args.cessationBasis === undefined
        ? (existing.cessationBasis ?? null)
        : args.cessationBasis;
    if ((endedOn === null) !== (cessationBasis === null)) {
      throw new Error(
        "Give both the day the trustee ceased and the reason, or neither."
      );
    }
    const endsOn =
      args.endsOn === undefined ? toIso(existing.endsOn) : args.endsOn;
    const dateProblem = termDateProblem({
      endedOn,
      endsOn,
      startsOn: args.startsOn,
    });
    if (dateProblem) {
      throw new Error(dateProblem);
    }
    const startEvidenceDocumentId =
      args.startEvidenceDocumentId === undefined
        ? (existing.startEvidenceDocumentId ?? null)
        : args.startEvidenceDocumentId;
    const endEvidenceDocumentId =
      args.endEvidenceDocumentId === undefined
        ? (existing.endEvidenceDocumentId ?? null)
        : args.endEvidenceDocumentId;
    const acceptanceDocumentId =
      args.acceptanceDocumentId === undefined
        ? (existing.acceptanceDocumentId ?? null)
        : args.acceptanceDocumentId;
    await assertDocumentsExist(tx, [
      startEvidenceDocumentId,
      endEvidenceDocumentId,
      acceptanceDocumentId,
    ]);
    const before = await loadRegister(tx);
    const row: TermRow = {
      basis: args.basis,
      endEvidenceDocumentId,
      endedOn,
      endsOn,
      id: args.id,
      startEvidenceDocumentId,
      startsOn: args.startsOn,
      trusteeId: existing.trusteeId,
    };
    assertNoNewProblems(before, {
      ...before,
      terms: before.terms.map((t) => (t.id === args.id ? row : t)),
    });
    await tx.mutate.trusteeTerm.update({
      acceptanceDocumentId,
      basis: args.basis,
      cessationBasis,
      endEvidenceDocumentId,
      endedOn: toEpoch(endedOn),
      endsOn: toEpoch(endsOn),
      id: args.id,
      startEvidenceDocumentId,
      startsOn: toEpoch(args.startsOn),
      updatedAt: Date.now(),
      validityNote:
        args.validityNote === undefined
          ? (existing.validityNote ?? null)
          : args.validityNote,
    });
  }),

  /** Records that a trustee ceased: resignation, death, absence, removal or the term's end. */
  end: defineMutator(termEndInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    await lockRegister(tx);
    const existing = await requireTerm(tx, args.id);
    if (existing.endedOn !== null && existing.endedOn !== undefined) {
      throw new Error("This term has already ended. Correct it instead.");
    }
    const dateProblem = termDateProblem({
      endedOn: args.endedOn,
      endsOn: toIso(existing.endsOn),
      startsOn: toIso(existing.startsOn),
    });
    if (dateProblem) {
      throw new Error(dateProblem);
    }
    await assertDocumentsExist(tx, [args.endEvidenceDocumentId]);
    const before = await loadRegister(tx);
    assertNoNewProblems(before, {
      ...before,
      terms: before.terms.map((t) =>
        t.id === args.id
          ? {
              ...t,
              endEvidenceDocumentId: args.endEvidenceDocumentId ?? null,
              endedOn: args.endedOn,
            }
          : t
      ),
    });
    // Offices still open end with the term, so the register reads the same
    // whether or not each one was closed separately; close them explicitly
    // so a later term can't revive them.
    const openOffices = await tx.run(
      zql.trusteeOffice
        .where("trusteeId", existing.trusteeId)
        .where("endedOn", "IS", null)
    );
    const now = Date.now();
    for (const office of openOffices) {
      if (office.startsOn < toEpoch(args.endedOn)) {
        await tx.mutate.trusteeOffice.update({
          endEvidenceDocumentId: args.endEvidenceDocumentId ?? null,
          endedOn: toEpoch(args.endedOn),
          id: office.id,
          updatedAt: now,
        });
      }
    }
    await tx.mutate.trusteeTerm.update({
      cessationBasis: args.cessationBasis,
      endEvidenceDocumentId: args.endEvidenceDocumentId ?? null,
      endedOn: toEpoch(args.endedOn),
      id: args.id,
      updatedAt: now,
      validityNote:
        args.validityNote === undefined
          ? (existing.validityNote ?? null)
          : args.validityNote,
    });
  }),

  /** Deletes a term entered by mistake; one with offices inside it can't go. */
  remove: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      await lockRegister(tx);
      const existing = await requireTerm(tx, args.id);
      const before = await loadRegister(tx);
      assertNoNewProblems(before, {
        ...before,
        terms: before.terms.filter((t) => t.id !== args.id),
      });
      await tx.mutate.trusteeTerm.delete({ id: existing.id });
    }
  ),
};

// ── Offices ─────────────────────────────────────────────────────────────────

const officeCreateInput = z.object({
  id: z.string(),
  office: z.enum(trusteeOfficeValues),
  startEvidenceDocumentId: documentId,
  startsOn: isoDate,
  trusteeId: z.string(),
  validityNote: note,
});

const officeUpdateInput = z.object({
  endEvidenceDocumentId: documentId,
  endedOn: isoDate.nullable().optional(),
  id: z.string(),
  office: z.enum(trusteeOfficeValues),
  startEvidenceDocumentId: documentId,
  startsOn: isoDate,
  validityNote: note,
});

const officeEndInput = z.object({
  endEvidenceDocumentId: documentId,
  endedOn: isoDate,
  id: z.string(),
  validityNote: note,
});

async function requireOffice(tx: Tx, id: string) {
  const office = await tx.run(zql.trusteeOffice.where("id", id).one());
  if (!office) {
    throw new Error("Office not found");
  }
  return office;
}

export const trusteeOfficeMutators = {
  create: defineMutator(officeCreateInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    await lockRegister(tx);
    await requireTrustee(tx, args.trusteeId);
    await assertDocumentsExist(tx, [args.startEvidenceDocumentId]);
    const before = await loadRegister(tx);
    const row: OfficeRow = {
      endEvidenceDocumentId: null,
      endedOn: null,
      id: args.id,
      office: args.office,
      startEvidenceDocumentId: args.startEvidenceDocumentId ?? null,
      startsOn: args.startsOn,
      trusteeId: args.trusteeId,
    };
    assertNoNewProblems(before, {
      ...before,
      offices: [...before.offices, row],
    });
    const now = Date.now();
    await tx.mutate.trusteeOffice.insert({
      createdAt: now,
      endEvidenceDocumentId: null,
      endedOn: null,
      id: args.id,
      office: args.office,
      startEvidenceDocumentId: args.startEvidenceDocumentId ?? null,
      startsOn: toEpoch(args.startsOn),
      trusteeId: args.trusteeId,
      updatedAt: now,
      validityNote: args.validityNote ?? null,
    });
  }),

  update: defineMutator(officeUpdateInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    await lockRegister(tx);
    const existing = await requireOffice(tx, args.id);
    const endedOn =
      args.endedOn === undefined ? toIso(existing.endedOn) : args.endedOn;
    const dateProblem = officeDateProblem({ endedOn, startsOn: args.startsOn });
    if (dateProblem) {
      throw new Error(dateProblem);
    }
    const startEvidenceDocumentId =
      args.startEvidenceDocumentId === undefined
        ? (existing.startEvidenceDocumentId ?? null)
        : args.startEvidenceDocumentId;
    const endEvidenceDocumentId =
      args.endEvidenceDocumentId === undefined
        ? (existing.endEvidenceDocumentId ?? null)
        : args.endEvidenceDocumentId;
    await assertDocumentsExist(tx, [
      startEvidenceDocumentId,
      endEvidenceDocumentId,
    ]);
    const before = await loadRegister(tx);
    const row: OfficeRow = {
      endEvidenceDocumentId,
      endedOn,
      id: args.id,
      office: args.office,
      startEvidenceDocumentId,
      startsOn: args.startsOn,
      trusteeId: existing.trusteeId,
    };
    assertNoNewProblems(before, {
      ...before,
      offices: before.offices.map((o) => (o.id === args.id ? row : o)),
    });
    await tx.mutate.trusteeOffice.update({
      endEvidenceDocumentId,
      endedOn: toEpoch(endedOn),
      id: args.id,
      office: args.office,
      startEvidenceDocumentId,
      startsOn: toEpoch(args.startsOn),
      updatedAt: Date.now(),
      validityNote:
        args.validityNote === undefined
          ? (existing.validityNote ?? null)
          : args.validityNote,
    });
  }),

  end: defineMutator(officeEndInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    await lockRegister(tx);
    const existing = await requireOffice(tx, args.id);
    if (existing.endedOn !== null && existing.endedOn !== undefined) {
      throw new Error("This office has already ended. Correct it instead.");
    }
    const dateProblem = officeDateProblem({
      endedOn: args.endedOn,
      startsOn: toIso(existing.startsOn),
    });
    if (dateProblem) {
      throw new Error(dateProblem);
    }
    await assertDocumentsExist(tx, [args.endEvidenceDocumentId]);
    await tx.mutate.trusteeOffice.update({
      endEvidenceDocumentId: args.endEvidenceDocumentId ?? null,
      endedOn: toEpoch(args.endedOn),
      id: args.id,
      updatedAt: Date.now(),
      validityNote:
        args.validityNote === undefined
          ? (existing.validityNote ?? null)
          : args.validityNote,
    });
  }),

  remove: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      await lockRegister(tx);
      const existing = await requireOffice(tx, args.id);
      await tx.mutate.trusteeOffice.delete({ id: existing.id });
    }
  ),
};

// ── Vault document details ──────────────────────────────────────────────────

const documentUpdateInput = z.object({
  datedOn: isoDate,
  id: z.string(),
  kind: z.enum(governanceDocumentKindValues),
  note: z.string().trim().max(VALIDITY_NOTE_MAX).nullable().optional(),
  title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX),
});

export const governanceDocumentMutators = {
  /** Title, kind, date and note; the file itself never changes. */
  update: defineMutator(documentUpdateInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    const existing = await tx.run(
      zql.governanceDocument.where("id", args.id).one()
    );
    if (!existing) {
      throw new Error("Document not found");
    }
    await tx.mutate.governanceDocument.update({
      datedOn: toEpoch(args.datedOn),
      id: args.id,
      kind: args.kind,
      note: args.note === undefined ? (existing.note ?? null) : args.note,
      title: args.title,
    });
  }),
};

// ── Deed versions ───────────────────────────────────────────────────────────

const deedVersionInput = z
  .object({
    amendmentThreshold: z.enum(resolutionThresholdValues),
    castingVote: z.enum(castingVoteRuleValues),
    circularIssuers: z.array(z.enum(trusteeOfficeValues)).min(1),
    coOptionMaxYears: z.number().int().min(0).max(50),
    documentId,
    effectiveFrom: isoDate,
    electronicCirculation: z.boolean(),
    id: z.string(),
    maxTrustees: z.number().int().min(1).max(100),
    minTrustees: z.number().int().min(1).max(100),
    noticeDays: z.number().int().min(0).max(365),
    quorumFloor: z.number().int().min(0).max(100),
    quorumKind: z.enum(quorumKindValues),
    quorumRequiredOffice: z.enum(trusteeOfficeValues).nullable(),
    quorumValue: z.number().int().min(1).max(100),
    title: z.string().trim().min(1).max(DOCUMENT_TITLE_MAX),
    videoCountsPresent: z.boolean(),
  })
  .refine((v) => v.maxTrustees >= v.minTrustees, {
    message: "The most trustees can't be fewer than the fewest.",
  });

export const deedVersionMutators = {
  /**
   * Records a registered deed of amendment as the next version. Its rules
   * apply to meetings and resolutions from its effective date.
   */
  create: defineMutator(deedVersionInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    const latest = await tx.run(
      zql.deedVersion.orderBy("number", "desc").one()
    );
    if (latest && toEpoch(args.effectiveFrom) <= latest.effectiveFrom) {
      throw new Error("A new version takes effect after the one before it.");
    }
    await assertDocumentsExist(tx, [args.documentId]);
    const { documentId: linked, effectiveFrom, id, ...rules } = args;
    await tx.mutate.deedVersion.insert({
      ...rules,
      createdAt: Date.now(),
      documentId: linked ?? null,
      effectiveFrom: toEpoch(effectiveFrom),
      id,
      number: (latest?.number ?? 0) + 1,
    });
  }),
  /** Links the registered deed (or deed of amendment) in the vault to its version. */
  linkDocument: defineMutator(
    z.object({ documentId: z.string().nullable(), id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const version = await tx.run(zql.deedVersion.where("id", args.id).one());
      if (!version) {
        throw new Error("Deed version not found");
      }
      if (args.documentId) {
        const document = await tx.run(
          zql.governanceDocument.where("id", args.documentId).one()
        );
        if (!document) {
          throw new Error("The document isn't in the vault");
        }
        if (
          !(
            document.kind === "trust_deed" || document.kind === "deed_amendment"
          )
        ) {
          throw new Error("Link a trust deed or a deed of amendment.");
        }
      }
      await tx.mutate.deedVersion.update({
        documentId: args.documentId,
        id: args.id,
      });
    }
  ),
};

// ── Registrations ───────────────────────────────────────────────────────────

const registrationInput = z
  .object({
    certificateDocumentId: documentId,
    id: z.string(),
    issuedOn: isoDate.nullable().optional(),
    number: z.string().trim().min(1).max(60),
    scopeNote: z.string().trim().max(VALIDITY_NOTE_MAX).nullable().optional(),
    type: z.enum(organisationRegistrationTypeValues),
    validFrom: isoDate.nullable().optional(),
    validTo: isoDate.nullable().optional(),
  })
  .refine(
    (v) => !(v.validFrom && v.validTo) || v.validTo >= v.validFrom,
    "Valid to must be on or after valid from"
  );

/** Governance keeps the trust's registrations; finance setup may too, as before. */
function assertCanManageRegistrations(
  ctx: Context | undefined
): asserts ctx is Context {
  assertIsLoggedIn(ctx);
  if (!(can(ctx, "governance.manage") || can(ctx, "finance.manage"))) {
    throw new Error("Unauthorized");
  }
}

export const organisationRegistrationMutators = {
  create: defineMutator(registrationInput, async ({ tx, ctx, args }) => {
    assertCanManageRegistrations(ctx);
    await assertDocumentsExist(tx, [args.certificateDocumentId]);
    const now = Date.now();
    await tx.mutate.organisationRegistration.insert({
      certificateDocumentId: args.certificateDocumentId ?? null,
      createdAt: now,
      id: args.id,
      issuedOn: toEpoch(args.issuedOn),
      number: args.number,
      scopeNote: args.scopeNote ?? null,
      type: args.type,
      updatedAt: now,
      validFrom: toEpoch(args.validFrom),
      validTo: toEpoch(args.validTo),
    });
  }),
  update: defineMutator(registrationInput, async ({ tx, ctx, args }) => {
    assertCanManageRegistrations(ctx);
    const existing = await tx.run(
      zql.organisationRegistration.where("id", args.id).one()
    );
    if (!existing) {
      throw new Error("Registration not found");
    }
    await assertDocumentsExist(tx, [args.certificateDocumentId]);
    await tx.mutate.organisationRegistration.update({
      certificateDocumentId:
        args.certificateDocumentId === undefined
          ? (existing.certificateDocumentId ?? null)
          : args.certificateDocumentId,
      id: args.id,
      issuedOn: toEpoch(args.issuedOn),
      number: args.number,
      scopeNote: args.scopeNote ?? null,
      type: args.type,
      updatedAt: Date.now(),
      validFrom: toEpoch(args.validFrom),
      validTo: toEpoch(args.validTo),
    });
  }),
};

// ── Resolution drafts ───────────────────────────────────────────────────────

export const effectInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    basis: z.enum(trusteeTermBasisValues),
    endsOn: isoDate.nullable(),
    startsOn: isoDate,
    trusteeId: z.string(),
    type: z.literal("term_start"),
  }),
  z.object({
    cessationBasis: z.enum(
      RESOLUTION_EFFECT_VALUES.cessationBasis as [
        Exclude<(typeof trusteeCessationBasisValues)[number], "removal_7_12">,
        ...Exclude<
          (typeof trusteeCessationBasisValues)[number],
          "removal_7_12"
        >[],
      ]
    ),
    endedOn: isoDate,
    trusteeId: z.string(),
    type: z.literal("term_end"),
  }),
  z.object({
    office: z.enum(trusteeOfficeValues),
    startsOn: isoDate,
    trusteeId: z.string(),
    type: z.literal("office_start"),
  }),
  z.object({
    endedOn: isoDate,
    hearingNote: z.string().trim().max(VALIDITY_NOTE_MAX),
    hearingOn: isoDate,
    trusteeId: z.string(),
    type: z.literal("removal"),
  }),
]);

const draftInput = z.object({
  body: z.string().max(RESOLUTION_TEXT_MAX),
  effect: effectInput,
  id: z.string(),
  templateKey: z.enum(resolutionTemplateKeyValues),
  title: z.string().trim().min(1).max(RESOLUTION_TITLE_MAX),
});

/**
 * On the server, locks what decides the draft before reading it, so an edit
 * can't land after it's issued or noticed: the meeting for one on an agenda
 * (every meeting write takes it), otherwise the row (as issuing does).
 */
async function requireDraft(tx: Tx, id: string) {
  if (tx.location === "server") {
    const server = requireServerTransaction(tx);
    const item = await tx.run(zql.agendaItem.where("resolutionId", id).one());
    if (item) {
      const { lockMeeting } = await import("@pi-dash/db/queries/meetings");
      await lockMeeting(server, item.meetingId);
    } else {
      const { lockResolution } =
        await import("@pi-dash/db/queries/resolutions");
      await lockResolution(server, id);
    }
  }
  const row = await tx.run(zql.resolution.where("id", id).one());
  if (!row) {
    throw new Error("Resolution not found");
  }
  if (row.status !== "draft") {
    throw new Error(
      "Only a draft can change. An issued resolution is withdrawn and a new one drafted."
    );
  }
  return row;
}

function assertDraftEffect(args: z.infer<typeof draftInput>) {
  const template = RESOLUTION_TEMPLATES[args.templateKey];
  if (args.effect.type !== template.effect) {
    throw new Error("The register change doesn't match the template.");
  }
}

/**
 * A meeting's resolutions are fixed once its notice goes out (clause 4.19).
 * `requireDraft` has taken the meeting's lock.
 */
async function assertAgendaOpen(tx: Tx, resolutionId: string) {
  const item = await tx.run(
    zql.agendaItem.where("resolutionId", resolutionId).one()
  );
  if (!item) {
    return;
  }
  const meeting = await tx.run(zql.meeting.where("id", item.meetingId).one());
  if (meeting?.status !== "draft") {
    throw new Error(
      "The notice has gone out with this resolution. Cancel the meeting and convene a new one to change it."
    );
  }
}

export const resolutionMutators = {
  createDraft: defineMutator(draftInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    assertDraftEffect(args);
    if (args.effect.type !== "none") {
      await requireTrustee(tx, args.effect.trusteeId);
    }
    const now = Date.now();
    await tx.mutate.resolution.insert({
      body: args.body,
      createdAt: now,
      draftedBy: ctx.userId,
      effect: args.effect,
      historical: false,
      id: args.id,
      kind: "circular",
      status: "draft",
      templateKey: args.templateKey,
      title: args.title,
      updatedAt: now,
    });
  }),
  updateDraft: defineMutator(draftInput, async ({ tx, ctx, args }) => {
    assertHasPermission(ctx, "governance.manage");
    const draft = await requireDraft(tx, args.id);
    if (draft.kind === "meeting") {
      await assertAgendaOpen(tx, args.id);
    }
    assertDraftEffect(args);
    if (args.effect.type !== "none") {
      await requireTrustee(tx, args.effect.trusteeId);
    }
    await tx.mutate.resolution.update({
      body: args.body,
      effect: args.effect,
      id: args.id,
      templateKey: args.templateKey,
      title: args.title,
      updatedAt: Date.now(),
    });
  }),
  deleteDraft: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const row = await requireDraft(tx, args.id);
      if (row.kind === "meeting") {
        throw new Error("Remove it from the meeting's agenda instead.");
      }
      await tx.mutate.resolution.delete({ id: args.id });
    }
  ),
};

// ── Compliance calendar ─────────────────────────────────────────────────────

async function requireItem(tx: Tx, id: string) {
  const item = await tx.run(zql.complianceItem.where("id", id).one());
  if (!item) {
    throw new Error("Item not found");
  }
  return item;
}

/** Locks the row on the server first, so a closure and a waiver can't both land. */
async function requireOpenItem(tx: Tx, id: string) {
  if (tx.location === "server") {
    const { lockComplianceItem } =
      await import("@pi-dash/db/queries/compliance");
    await lockComplianceItem(requireServerTransaction(tx), id);
  }
  const item = await requireItem(tx, id);
  if (item.status !== "open") {
    throw new Error(
      item.status === "waived"
        ? "This item has already been waived."
        : "This item is already closed."
    );
  }
  return item;
}

export const complianceItemMutators = {
  /** An item added by hand, outside the templates. */
  create: defineMutator(
    z.object({
      dueOn: isoDate,
      id: z.string(),
      note: z.string().trim().max(COMPLIANCE_NOTE_MAX).nullable().optional(),
      ownerUserId: z.string().nullable().optional(),
      title: z.string().trim().min(1).max(COMPLIANCE_TITLE_MAX),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const now = Date.now();
      await tx.mutate.complianceItem.insert({
        createdAt: now,
        dueOn: toEpoch(args.dueOn),
        fiscalYear: fiscalYearLabel(args.dueOn),
        id: args.id,
        note: args.note ?? null,
        ownerUserId: args.ownerUserId ?? null,
        sourceKey: null,
        status: "open",
        templateId: null,
        title: args.title,
        updatedAt: now,
      });
    }
  ),
  /** Done, with the filing or record that proves it: an item never closes on a click. */
  close: defineMutator(
    z.object({
      evidenceDocumentId: z.string(),
      id: z.string(),
      note: z.string().trim().max(COMPLIANCE_NOTE_MAX).nullable().optional(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const item = await requireOpenItem(tx, args.id);
      await assertDocumentsExist(tx, [args.evidenceDocumentId]);
      const now = Date.now();
      await tx.mutate.complianceItem.update({
        closedAt: now,
        closedBy: ctx.userId,
        evidenceDocumentId: args.evidenceDocumentId,
        id: args.id,
        note: args.note === undefined ? (item.note ?? null) : args.note,
        status: "done",
        updatedAt: now,
      });
    }
  ),
  /** Not needed this time, with the reason. */
  waive: defineMutator(
    z.object({
      id: z.string(),
      note: z.string().trim().min(1).max(COMPLIANCE_NOTE_MAX),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      await requireOpenItem(tx, args.id);
      const now = Date.now();
      await tx.mutate.complianceItem.update({
        closedAt: now,
        closedBy: ctx.userId,
        id: args.id,
        note: args.note,
        status: "waived",
        updatedAt: now,
      });
    }
  ),
  reopen: defineMutator(
    z.object({ id: z.string() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      await requireItem(tx, args.id);
      await tx.mutate.complianceItem.update({
        closedAt: null,
        closedBy: null,
        evidenceDocumentId: null,
        id: args.id,
        status: "open",
        updatedAt: Date.now(),
      });
    }
  ),
  assign: defineMutator(
    z.object({ id: z.string(), ownerUserId: z.string().nullable() }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      await requireItem(tx, args.id);
      await tx.mutate.complianceItem.update({
        id: args.id,
        ownerUserId: args.ownerUserId,
        updatedAt: Date.now(),
      });
    }
  ),
};

export const complianceTemplateMutators = {
  /** Owner and on/off; the rule itself comes from the default calendar. */
  update: defineMutator(
    z.object({
      active: z.boolean(),
      id: z.string(),
      ownerUserId: z.string().nullable(),
    }),
    async ({ tx, ctx, args }) => {
      assertHasPermission(ctx, "governance.manage");
      const template = await tx.run(
        zql.complianceTemplate.where("id", args.id).one()
      );
      if (!template) {
        throw new Error("Template not found");
      }
      await tx.mutate.complianceTemplate.update({
        active: args.active,
        id: args.id,
        ownerUserId: args.ownerUserId,
        updatedAt: Date.now(),
      });
    }
  ),
};
