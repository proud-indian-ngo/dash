import {
  type DirectoryRole,
  directoryRoleValues,
  type ForeignSourceAssessment,
  type PartyFillField,
  type PartyIdType,
} from "@pi-dash/shared/constants";
import { and, eq, inArray, sql } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  revealSecret,
  encryptSecret,
  hasEncryptionKey,
  visibleTail,
} from "../encryption";
import { partyIdNumberContext } from "../encryption-contexts";
import {
  buildFillSave,
  fillValuesPresent,
  PartyConflictError,
  type PartyFillValues,
  partyDetailGaps,
  resolveAssessedOn,
  resolveSaveMode,
  resolveSecret,
  type SavePartyInput,
} from "../party-save-rules";
import { party, partyRole } from "../schema/party";
import { partyPrivate } from "../schema/private/party-private";
import { vendor } from "../schema/vendor";

export {
  fillValuesPresent,
  PartyConflictError,
  type PartyFillValues,
  partyDetailGaps,
  type SavePartyInput,
};

/** Associated data binding an encrypted identifier to its party. */
export { partyIdNumberContext };

/** What the directory may show: contact details and a masked identifier. */
export interface PartyPrivateView {
  addressLine1: string | null;
  addressLine2: string | null;
  assessedOn: string | null;
  assessmentNote: string | null;
  city: string | null;
  country: string;
  email: string | null;
  foreignSourceAssessment: ForeignSourceAssessment;
  /** Whether an identifier is stored at all; the tail may still be hidden for short values. */
  hasIdNumber: boolean;
  idNumberLast4: string | null;
  idType: PartyIdType;
  nationality: string | null;
  partyId: string;
  phone: string | null;
  pincode: string | null;
  state: string | null;
  updatedAt: number;
}

function toView(row: typeof partyPrivate.$inferSelect): PartyPrivateView {
  return {
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    assessedOn: row.assessedOn,
    assessmentNote: row.assessmentNote,
    city: row.city,
    country: row.country,
    email: row.email,
    foreignSourceAssessment: row.foreignSourceAssessment,
    hasIdNumber: row.idNumberEncrypted !== null,
    idNumberLast4: row.idNumberLast4,
    idType: row.idType,
    nationality: row.nationality,
    partyId: row.partyId,
    phone: row.phone,
    pincode: row.pincode,
    state: row.state,
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function getPartyPrivate(
  partyId: string
): Promise<PartyPrivateView | null> {
  const [row] = await db
    .select()
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, partyId))
    .limit(1);
  return row ? toView(row) : null;
}

/** The decrypted identifier, for holders of finance.view_sensitive only. */
export async function revealPartyIdNumber(
  partyId: string
): Promise<string | null> {
  const [row] = await db
    .select({ encrypted: partyPrivate.idNumberEncrypted })
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, partyId))
    .limit(1);
  return row?.encrypted
    ? revealSecret(row.encrypted, partyIdNumberContext(partyId))
    : null;
}

/** Calendar day in India, where the trust keeps its books. */
function istToday(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).format(now);
}

export interface SavePartyResult {
  /** True when this save removed a stored identifier. */
  clearedIdentifier: boolean;
  created: boolean;
  partyId: string;
  view: PartyPrivateView;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serialises saves of one party ID for the rest of the transaction. Taken
 * before any row lock, so a resent create waits for the first and then
 * resolves as a retry instead of failing on the primary key.
 */
export async function lockPartyId(tx: Tx, partyId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${partyId}))`);
}

export const nullIfBlank = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

/**
 * Create or update a party, its directory roles and its private details in one
 * transaction, so a failed step never leaves a half-saved donor. The party and
 * private rows are locked while the version checks run, so two editors cannot
 * both pass them. Private values never leave this module except through
 * `revealPartyIdNumber`.
 */
export async function saveParty(
  input: SavePartyInput,
  actorId: string
): Promise<SavePartyResult> {
  return await db.transaction(
    async (tx) => await savePartyInTransaction(tx, input, actorId)
  );
}

/**
 * `saveParty` inside a caller's transaction, so a CSV import creates its new
 * donors through the same validation and encryption and rolls them back
 * with the rest of the run. `actorId` is null when the system saves (a
 * Razorpay payment imported on arrival).
 */
export async function savePartyInTransaction(
  tx: Tx,
  input: SavePartyInput,
  actorId: string | null
): Promise<SavePartyResult> {
  const now = new Date();
  const today = istToday(now);
  const partyId = input.id;

  await lockPartyId(tx, partyId);
  const [existingParty] = await tx
    .select()
    .from(party)
    .where(eq(party.id, partyId))
    .limit(1)
    .for("update");
  const [existingPrivate] = await tx
    .select()
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, partyId))
    .limit(1)
    .for("update");
  const mode = resolveSaveMode(
    {
      actorId,
      expectedPartyUpdatedAt: input.expectedPartyUpdatedAt,
      expectedUpdatedAt: input.expectedUpdatedAt,
      mode: input.mode,
    },
    existingParty ?? null,
    existingPrivate ?? null
  );
  if (mode.kind === "retry") {
    if (!existingPrivate) {
      throw new Error("Party details could not be saved");
    }
    return {
      clearedIdentifier: false,
      created: true,
      partyId,
      view: toView(existingPrivate),
    };
  }

  const identity = {
    displayName: input.displayName.trim(),
    kind: input.kind,
    legalName: nullIfBlank(input.legalName),
    ...(input.taxCertificateOptOut === undefined
      ? {}
      : { taxCertificateOptOut: input.taxCertificateOptOut }),
  };
  if (mode.kind === "update") {
    await tx
      .update(party)
      .set({ ...identity, updatedAt: now })
      .where(eq(party.id, partyId));
    // A party that is also a vendor keeps its supplier name in step.
    await tx
      .update(vendor)
      .set({ name: identity.displayName, updatedAt: now })
      .where(eq(vendor.id, partyId));
  } else {
    await tx.insert(party).values({
      ...identity,
      createdAt: now,
      createdBy: actorId,
      id: partyId,
      updatedAt: now,
    });
  }

  const wanted = new Set<DirectoryRole>(input.roles);
  const currentRoles = await tx
    .select()
    .from(partyRole)
    .where(
      and(
        eq(partyRole.partyId, partyId),
        inArray(partyRole.role, [...directoryRoleValues])
      )
    );
  const byRole = new Map(currentRoles.map((r) => [r.role, r]));
  for (const role of directoryRoleValues) {
    const current = byRole.get(role);
    const want = wanted.has(role);
    if (current && current.active !== want) {
      await tx
        .update(partyRole)
        .set({ active: want })
        .where(eq(partyRole.id, current.id));
    } else if (!current && want) {
      await tx.insert(partyRole).values({
        active: true,
        id: uuidv7(),
        partyId,
        role,
        since: now,
      });
    }
  }

  const secret = resolveSecret(input, existingPrivate ?? null, (plain) => {
    if (!hasEncryptionKey()) {
      throw new Error(
        "Identifiers cannot be stored right now; ask an administrator to configure encryption"
      );
    }
    return {
      encrypted: encryptSecret(plain, partyIdNumberContext(partyId)),
      last4: visibleTail(plain),
    };
  });
  const values = {
    addressLine1: nullIfBlank(input.addressLine1),
    addressLine2: nullIfBlank(input.addressLine2),
    assessedOn: resolveAssessedOn(
      input.foreignSourceAssessment,
      existingPrivate ?? null,
      today
    ),
    assessmentNote: nullIfBlank(input.assessmentNote),
    city: nullIfBlank(input.city),
    country: input.country.trim().toUpperCase() || "IN",
    email: nullIfBlank(input.email),
    foreignSourceAssessment: input.foreignSourceAssessment,
    idNumberEncrypted: secret.idNumberEncrypted,
    idNumberLast4: secret.idNumberLast4,
    idType: input.idType,
    nationality: nullIfBlank(input.nationality),
    phone: nullIfBlank(input.phone),
    pincode: nullIfBlank(input.pincode),
    state: nullIfBlank(input.state),
  };
  const [row] = await tx
    .insert(partyPrivate)
    .values({ ...values, partyId, updatedAt: now, updatedBy: actorId })
    .onConflictDoUpdate({
      set: { ...values, updatedAt: now, updatedBy: actorId },
      target: partyPrivate.partyId,
    })
    .returning();
  if (!row) {
    throw new Error("Party details could not be saved");
  }
  return {
    clearedIdentifier: secret.cleared,
    created: mode.kind === "create",
    partyId,
    view: toView(row),
  };
}

/**
 * Adds an imported row's details to an existing party only where the party
 * has none, through `savePartyInTransaction` with the rows' versions, so
 * identifiers are encrypted as in the donor form and nothing stored is
 * replaced. The address fills as a whole, never line by line. Returns the
 * fields filled; an empty list writes nothing.
 */
export async function fillMissingPartyDetails(
  tx: Tx,
  partyId: string,
  values: PartyFillValues,
  actorId: string | null,
  options: { canStoreIds: boolean }
): Promise<PartyFillField[]> {
  // Taken before reading, so the versions read here are the ones the save checks.
  await lockPartyId(tx, partyId);
  const [existingParty] = await tx
    .select()
    .from(party)
    .where(eq(party.id, partyId))
    .limit(1);
  if (!existingParty) {
    return [];
  }
  const [existing] = await tx
    .select()
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, partyId))
    .limit(1);
  const roles = await tx
    .select({ role: partyRole.role })
    .from(partyRole)
    .where(
      and(
        eq(partyRole.partyId, partyId),
        eq(partyRole.active, true),
        inArray(partyRole.role, [...directoryRoleValues])
      )
    );
  const save = buildFillSave(
    existingParty,
    existing ?? null,
    roles.map((r) => r.role as DirectoryRole),
    values,
    options
  );
  if (!save) {
    return [];
  }
  await savePartyInTransaction(tx, save.input, actorId);
  return save.fill;
}
