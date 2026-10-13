import {
  type DirectoryRole,
  directoryRoleValues,
  type ForeignSourceAssessment,
  type PartyIdType,
  type PartyKind,
} from "@pi-dash/shared/constants";
import { and, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  decryptSecret,
  encryptSecret,
  hasEncryptionKey,
  visibleTail,
} from "../encryption";
import { party, partyRole } from "../schema/party";
import { partyPrivate } from "../schema/private/party-private";

const idContext = (partyId: string) => `party_private.id_number:${partyId}`;

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
    ? decryptSecret(row.encrypted, idContext(partyId))
    : null;
}

export interface SavePartyInput {
  addressLine1: string;
  addressLine2: string;
  assessmentNote: string;
  city: string;
  country: string;
  displayName: string;
  email: string;
  /** The private row's updatedAt the editor loaded; a newer row rejects the save. */
  expectedUpdatedAt?: number;
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
}

export class PartyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PartyConflictError";
  }
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
  created: boolean;
  partyId: string;
  view: PartyPrivateView;
}

const nullIfBlank = (value: string): string | null =>
  value.trim() === "" ? null : value.trim();

/**
 * Create or update a party, its directory roles and its private details in one
 * transaction, so a failed step never leaves a half-saved donor. Private
 * values never leave this module except through `revealPartyIdNumber`.
 */
export async function saveParty(
  input: SavePartyInput,
  actorId: string
): Promise<SavePartyResult> {
  const now = new Date();
  const today = istToday(now);
  const partyId = input.id;

  return await db.transaction(async (tx) => {
    const [existingParty] = await tx
      .select()
      .from(party)
      .where(eq(party.id, partyId))
      .limit(1);
    if (input.mode === "update" && !existingParty) {
      throw new Error("Party not found");
    }
    const identity = {
      displayName: input.displayName.trim(),
      kind: input.kind,
      legalName: nullIfBlank(input.legalName),
    };
    if (existingParty) {
      await tx
        .update(party)
        .set({ ...identity, updatedAt: now })
        .where(eq(party.id, partyId));
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

    const [existingPrivate] = await tx
      .select()
      .from(partyPrivate)
      .where(eq(partyPrivate.partyId, partyId))
      .limit(1);
    if (
      existingPrivate &&
      input.expectedUpdatedAt !== undefined &&
      existingPrivate.updatedAt.getTime() !== input.expectedUpdatedAt
    ) {
      throw new PartyConflictError(
        "Someone else changed this donor while you were editing. Reload and try again."
      );
    }

    const idNumber = input.idNumber.trim().toUpperCase();
    let secret: {
      idNumberEncrypted: string | null;
      idNumberLast4: string | null;
    };
    if (input.idType === "none") {
      secret = { idNumberEncrypted: null, idNumberLast4: null };
    } else if (idNumber) {
      if (!hasEncryptionKey()) {
        throw new Error(
          "Identifiers cannot be stored right now; ask an administrator to configure encryption"
        );
      }
      secret = {
        idNumberEncrypted: encryptSecret(idNumber, idContext(partyId)),
        idNumberLast4: visibleTail(idNumber),
      };
    } else if (
      existingPrivate?.idNumberEncrypted &&
      existingPrivate.idType === input.idType
    ) {
      secret = {
        idNumberEncrypted: existingPrivate.idNumberEncrypted,
        idNumberLast4: existingPrivate.idNumberLast4,
      };
    } else {
      throw new Error("Enter the identifier or set the ID type to none");
    }
    // The assessment date records when someone decided domestic or foreign;
    // "pending" means no decision yet, so it carries no date.
    const assessmentChanged =
      existingPrivate?.foreignSourceAssessment !==
      input.foreignSourceAssessment;
    let assessedOn: string | null = existingPrivate?.assessedOn ?? null;
    if (input.foreignSourceAssessment === "pending") {
      assessedOn = null;
    } else if (assessmentChanged || !existingPrivate) {
      assessedOn = today;
    }
    const values = {
      addressLine1: nullIfBlank(input.addressLine1),
      addressLine2: nullIfBlank(input.addressLine2),
      assessedOn,
      assessmentNote: nullIfBlank(input.assessmentNote),
      city: nullIfBlank(input.city),
      country: input.country.trim().toUpperCase() || "IN",
      email: nullIfBlank(input.email),
      foreignSourceAssessment: input.foreignSourceAssessment,
      idType: input.idType,
      nationality: nullIfBlank(input.nationality),
      phone: nullIfBlank(input.phone),
      pincode: nullIfBlank(input.pincode),
      state: nullIfBlank(input.state),
    };
    const [row] = await tx
      .insert(partyPrivate)
      .values({
        ...values,
        ...secret,
        partyId,
        updatedAt: now,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        set: { ...values, ...secret, updatedAt: now, updatedBy: actorId },
        target: partyPrivate.partyId,
      })
      .returning();
    if (!row) {
      throw new Error("Party details could not be saved");
    }
    return {
      created: !existingParty,
      partyId,
      view: toView(row),
    };
  });
}
