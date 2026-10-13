import {
  type ForeignSourceAssessment,
  PARTY_SAVE_CONFLICT_PREFIX,
  type PartyIdType,
} from "@pi-dash/shared/constants";

/**
 * Pure decision rules for saving a party, kept apart from the database so
 * they can be unit-tested: how a request maps onto the existing rows, which
 * identifier to store, and when the foreign-source assessment was decided.
 */

export class PartyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartyConflictError";
  }
}

export interface ExistingPartyRow {
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
}

export interface ExistingPrivateRow {
  assessedOn: string | null;
  foreignSourceAssessment: ForeignSourceAssessment;
  idNumberEncrypted: string | null;
  idNumberLast4: string | null;
  idType: PartyIdType;
  updatedAt: Date;
}

export interface SaveModeInput {
  actorId: string;
  /** The private row's updatedAt the editor loaded; null when it loaded none. */
  expectedUpdatedAt: number | null;
  /** The party row's updatedAt the editor loaded; null on create. */
  expectedPartyUpdatedAt: number | null;
  mode: "create" | "update";
}

export type SaveMode =
  /** No party yet: insert everything. */
  | { kind: "create" }
  /** The same create already completed; write nothing and return the current rows. */
  | { kind: "retry" }
  /** Rows exist and match what the editor loaded. */
  | { kind: "update" };

/**
 * Decides whether the request creates, retries or updates, and refuses saves
 * that would overwrite rows the editor never saw. Called inside the saving
 * transaction with the rows locked, so the answer holds until commit.
 */
export function resolveSaveMode(
  input: SaveModeInput,
  existingParty: ExistingPartyRow | null,
  existingPrivate: Pick<ExistingPrivateRow, "updatedAt"> | null,
  /** What the record is called in conflict messages. */
  noun = "donor"
): SaveMode {
  if (input.mode === "create") {
    if (!existingParty) {
      return { kind: "create" };
    }
    // A retried create finds rows written in one go by the same actor and
    // untouched since. Anything else is someone reusing an ID.
    const createdAt = existingParty.createdAt.getTime();
    const untouched =
      existingParty.createdBy === input.actorId &&
      existingParty.updatedAt.getTime() === createdAt &&
      (existingPrivate === null ||
        existingPrivate.updatedAt.getTime() === createdAt);
    if (!untouched) {
      throw new PartyConflictError(`A ${noun} with this ID already exists`);
    }
    return { kind: "retry" };
  }
  if (!existingParty) {
    throw new Error("Party not found");
  }
  const stale =
    (input.expectedPartyUpdatedAt !== null &&
      existingParty.updatedAt.getTime() !== input.expectedPartyUpdatedAt) ||
    (input.expectedUpdatedAt === null
      ? existingPrivate !== null
      : existingPrivate === null ||
        existingPrivate.updatedAt.getTime() !== input.expectedUpdatedAt);
  if (stale) {
    throw new PartyConflictError(
      `${PARTY_SAVE_CONFLICT_PREFIX} this ${noun} while you were editing. Reload and try again.`
    );
  }
  return { kind: "update" };
}

export interface StoredSecret {
  /** True when a stored identifier is being removed by this save. */
  cleared: boolean;
  idNumberEncrypted: string | null;
  idNumberLast4: string | null;
}

/**
 * Which identifier to store: none clears, a value replaces, and a blank
 * value keeps a stored identifier of the same type.
 */
export function resolveSecret(
  input: { idNumber: string; idType: PartyIdType },
  existing: Pick<
    ExistingPrivateRow,
    "idNumberEncrypted" | "idNumberLast4" | "idType"
  > | null,
  encrypt: (plain: string) => { encrypted: string; last4: string | null }
): StoredSecret {
  const idNumber = input.idNumber.trim().toUpperCase();
  if (input.idType === "none") {
    return {
      cleared: existing?.idNumberEncrypted !== null && existing !== null,
      idNumberEncrypted: null,
      idNumberLast4: null,
    };
  }
  if (idNumber) {
    const stored = encrypt(idNumber);
    return {
      cleared: false,
      idNumberEncrypted: stored.encrypted,
      idNumberLast4: stored.last4,
    };
  }
  if (existing?.idNumberEncrypted && existing.idType === input.idType) {
    return {
      cleared: false,
      idNumberEncrypted: existing.idNumberEncrypted,
      idNumberLast4: existing.idNumberLast4,
    };
  }
  throw new Error("Enter the identifier or set the ID type to none");
}

/**
 * The assessment date records when someone decided domestic or foreign;
 * "pending" means no decision yet, so it carries no date.
 */
export function resolveAssessedOn(
  assessment: ForeignSourceAssessment,
  existing: Pick<
    ExistingPrivateRow,
    "assessedOn" | "foreignSourceAssessment"
  > | null,
  today: string
): string | null {
  if (assessment === "pending") {
    return null;
  }
  if (!existing || existing.foreignSourceAssessment !== assessment) {
    return today;
  }
  // Rows seeded or imported without a date get one the first time they are saved.
  return existing.assessedOn ?? today;
}

export type BankAccountPlan =
  /** Encrypt this number into a new active account; older accounts are deactivated. */
  | { accountNumber: string; kind: "replace" }
  /** Keep the active account's number; only its name and IFSC change. */
  | { accountId: string; kind: "keep" };

/**
 * Which bank account a save leaves active: a given number replaces, a blank
 * one keeps the active account, and with neither, a number still waiting in
 * the pre-party legacy row is carried over.
 */
export function resolveBankAccount(
  accountNumber: string,
  active: { id: string } | null,
  legacyAccountNumber: string | null
): BankAccountPlan {
  const given = accountNumber.trim();
  if (given) {
    return { accountNumber: given, kind: "replace" };
  }
  if (active) {
    return { accountId: active.id, kind: "keep" };
  }
  const legacy = legacyAccountNumber?.trim();
  if (legacy) {
    return { accountNumber: legacy, kind: "replace" };
  }
  throw new Error("Enter the account number");
}
