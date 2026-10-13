import type {
  ForeignSourceAssessment,
  PartyIdType,
} from "@pi-dash/shared/constants";
import { eq } from "drizzle-orm";

import { db } from "..";
import { decryptSecret, encryptSecret, last4 } from "../encryption";
import { partyPrivate } from "../schema/private/party-private";

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
  idNumberLast4: string | null;
  idType: PartyIdType;
  nationality: string | null;
  partyId: string;
  phone: string | null;
  pincode: string | null;
  state: string | null;
  updatedAt: number;
}

export interface PartyPrivateInput {
  addressLine1?: string | null;
  addressLine2?: string | null;
  assessedOn?: string | null;
  assessmentNote?: string | null;
  city?: string | null;
  country?: string;
  email?: string | null;
  foreignSourceAssessment?: ForeignSourceAssessment;
  /** Full identifier; stored encrypted. `undefined` keeps the stored value, `null` clears it. */
  idNumber?: string | null;
  idType?: PartyIdType;
  nationality?: string | null;
  phone?: string | null;
  pincode?: string | null;
  state?: string | null;
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
  return row?.encrypted ? decryptSecret(row.encrypted) : null;
}

/** Field names that changed, for the audit ledger; never the values. */
export async function upsertPartyPrivate(
  partyId: string,
  input: PartyPrivateInput,
  updatedBy: string
): Promise<{ changedFields: string[]; view: PartyPrivateView }> {
  const now = new Date();
  const idNumber = input.idNumber?.trim();
  const secret =
    input.idNumber === undefined
      ? {}
      : idNumber
        ? {
            idNumberEncrypted: encryptSecret(idNumber),
            idNumberLast4: last4(idNumber),
          }
        : { idNumberEncrypted: null, idNumberLast4: null };
  const values = {
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    assessedOn: input.assessedOn ?? null,
    assessmentNote: input.assessmentNote ?? null,
    city: input.city ?? null,
    country: input.country ?? "IN",
    email: input.email ?? null,
    foreignSourceAssessment: input.foreignSourceAssessment ?? "domestic",
    idType: input.idType ?? "none",
    nationality: input.nationality ?? null,
    phone: input.phone ?? null,
    pincode: input.pincode ?? null,
    state: input.state ?? null,
    ...secret,
  };
  const [row] = await db
    .insert(partyPrivate)
    .values({ ...values, partyId, updatedAt: now, updatedBy })
    .onConflictDoUpdate({
      set: { ...values, updatedAt: now, updatedBy },
      target: partyPrivate.partyId,
    })
    .returning();
  if (!row) {
    throw new Error("Party private details could not be saved");
  }
  const changedFields = Object.keys(values).filter(
    (k) => k !== "idNumberEncrypted"
  );
  return { changedFields, view: toView(row) };
}
