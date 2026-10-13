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
import {
  PartyConflictError,
  resolveAssessedOn,
  resolveSaveMode,
  resolveSecret,
} from "../party-save-rules";
import { party, partyRole } from "../schema/party";
import { partyPrivate } from "../schema/private/party-private";

export { PartyConflictError };

/** Associated data binding an encrypted identifier to its party. */
export const partyIdNumberContext = (partyId: string) =>
  `party_private.id_number:${partyId}`;

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
    ? decryptSecret(row.encrypted, partyIdNumberContext(partyId))
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
  const now = new Date();
  const today = istToday(now);
  const partyId = input.id;

  return await db.transaction(async (tx) => {
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
    };
    if (mode.kind === "update") {
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
  });
}
