import {
  type DirectoryRole,
  type ForeignSourceAssessment,
  PARTY_SAVE_CONFLICT_PREFIX,
  type PartyFillField,
  partyFillFieldValues,
  type PartyIdType,
  type PartyKind,
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

export interface SavePartyInput {
  addressLine1: string;
  addressLine2: string;
  assessmentNote: string;
  city: string;
  country: string;
  displayName: string;
  email: string;
  /** The party row's updatedAt the editor loaded; null on create. A newer row rejects the save. */
  expectedPartyUpdatedAt: number | null;
  /** The private row's updatedAt the editor loaded; null when it loaded none. */
  expectedUpdatedAt: number | null;
  foreignSourceAssessment: ForeignSourceAssessment;
  /** Client-generated on create so a retried request is idempotent. */
  id: string;
  /** Blank keeps a stored identifier of the same type; a value replaces it. */
  idNumber: string;
  idType: PartyIdType;
  kind: PartyKind;
  legalName: string;
  mode: "create" | "update";
  nationality: string;
  phone: string;
  pincode: string;
  roles: readonly DirectoryRole[];
  state: string;
  /**
   * The donor doesn't want a tax certificate (80G). Left out (imports,
   * filling missing details), a save keeps the stored choice; a new party
   * starts without it.
   */
  taxCertificateOptOut?: boolean;
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
  /** Null for a system save, which never counts as a retry. */
  actorId: string | null;
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
    // untouched since. Anything else is someone reusing an ID. System saves
    // always use a fresh ID and have no actor to compare, so an existing
    // party is never theirs.
    const createdAt = existingParty.createdAt.getTime();
    const untouched =
      input.actorId !== null &&
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
 * Which bank account a save leaves active: a given number replaces, and a
 * blank one keeps the active account.
 */
export function resolveBankAccount(
  accountNumber: string,
  active: { id: string } | null
): BankAccountPlan {
  const given = accountNumber.trim();
  if (given) {
    return { accountNumber: given, kind: "replace" };
  }
  if (active) {
    return { accountId: active.id, kind: "keep" };
  }
  throw new Error("Enter the account number");
}

/** Whitespace counts as no value, as `nullIfBlank` stores it. */
const isFilled = (value: string | null | undefined): boolean =>
  Boolean(value?.trim());

/** Which fill fields a donor has no value for; a donor without private details lacks them all. */
export function partyDetailGaps(
  row: {
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    email: string | null;
    idNumberEncrypted: string | null;
    phone: string | null;
    pincode: string | null;
    state: string | null;
  } | null
): Record<PartyFillField, boolean> {
  return {
    address: !(
      isFilled(row?.addressLine1) ||
      isFilled(row?.addressLine2) ||
      isFilled(row?.city) ||
      isFilled(row?.state) ||
      isFilled(row?.pincode)
    ),
    email: !isFilled(row?.email),
    idNumber: !isFilled(row?.idNumberEncrypted),
    phone: !isFilled(row?.phone),
  };
}

/** Details from an imported row that may fill a donor's empty fields. */
export interface PartyFillValues {
  addressLine1: string;
  addressLine2: string;
  city: string;
  email: string;
  idNumber: string;
  idType: PartyIdType;
  phone: string;
  pincode: string;
  state: string;
}

/** The fill fields `values` has something for. */
export function fillValuesPresent(
  values: PartyFillValues,
  options: { canStoreIds: boolean }
): Record<PartyFillField, boolean> {
  return {
    address:
      isFilled(values.addressLine1) ||
      isFilled(values.addressLine2) ||
      isFilled(values.city) ||
      isFilled(values.state) ||
      isFilled(values.pincode),
    email: isFilled(values.email),
    idNumber:
      options.canStoreIds &&
      values.idType !== "none" &&
      isFilled(values.idNumber),
    phone: isFilled(values.phone),
  };
}

/** The stored private row as far as filling it needs. */
export type ExistingFillRow = Pick<
  ExistingPrivateRow,
  "foreignSourceAssessment" | "idNumberEncrypted" | "idType" | "updatedAt"
> & {
  addressLine1: string | null;
  addressLine2: string | null;
  assessmentNote: string | null;
  city: string | null;
  country: string;
  email: string | null;
  nationality: string | null;
  phone: string | null;
  pincode: string | null;
  state: string | null;
};

/**
 * The save that fills a party's empty fields from an imported row: only the
 * gaps take the row's values, the address only as a whole when no line is
 * stored, and everything else (identifier, country, nationality, assessment,
 * legal name, roles) goes back as stored, so the save changes nothing else.
 * Null when there is nothing to fill.
 */
export function buildFillSave(
  existingParty: {
    displayName: string;
    id: string;
    kind: PartyKind;
    legalName: string | null;
    updatedAt: Date;
  },
  existing: ExistingFillRow | null,
  roles: readonly DirectoryRole[],
  values: PartyFillValues,
  options: { canStoreIds: boolean }
): { fill: PartyFillField[]; input: SavePartyInput } | null {
  const gaps = partyDetailGaps(existing);
  const present = fillValuesPresent(values, options);
  const fill = partyFillFieldValues.filter(
    (field) => gaps[field] && present[field]
  );
  if (fill.length === 0) {
    return null;
  }
  const fills = new Set(fill);
  const keep = (value: string | null | undefined) => value ?? "";
  const address = fills.has("address");
  let id: { idNumber: string; idType: PartyIdType };
  if (fills.has("idNumber")) {
    id = { idNumber: values.idNumber, idType: values.idType };
  } else if (existing?.idNumberEncrypted) {
    // Blank with the stored type keeps the stored identifier.
    id = { idNumber: "", idType: existing.idType };
  } else {
    id = { idNumber: "", idType: "none" };
  }
  return {
    fill,
    input: {
      addressLine1: address
        ? values.addressLine1
        : keep(existing?.addressLine1),
      addressLine2: address
        ? values.addressLine2
        : keep(existing?.addressLine2),
      assessmentNote: keep(existing?.assessmentNote),
      city: address ? values.city : keep(existing?.city),
      country: existing?.country ?? "IN",
      displayName: existingParty.displayName,
      email: fills.has("email") ? values.email : keep(existing?.email),
      expectedPartyUpdatedAt: existingParty.updatedAt.getTime(),
      expectedUpdatedAt: existing ? existing.updatedAt.getTime() : null,
      foreignSourceAssessment: existing?.foreignSourceAssessment ?? "domestic",
      id: existingParty.id,
      ...id,
      kind: existingParty.kind,
      legalName: keep(existingParty.legalName),
      mode: "update",
      nationality: keep(existing?.nationality),
      phone: fills.has("phone") ? values.phone : keep(existing?.phone),
      pincode: address ? values.pincode : keep(existing?.pincode),
      roles,
      state: address ? values.state : keep(existing?.state),
    },
  };
}
