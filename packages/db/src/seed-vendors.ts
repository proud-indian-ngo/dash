import { eq } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { encryptSecret, hasEncryptionKey, visibleTail } from "./encryption";
import { db } from "./index";
import { partyIdNumberContext } from "./queries/party-private";
import { accountNumberContext } from "./queries/vendor-party";
import { party, partyRole } from "./schema/party";
import { partyBankAccount, partyPrivate } from "./schema/private/party-private";
import { type VendorStatus, vendor } from "./schema/vendor";

export interface SeedVendorPrivate {
  address?: string;
  bankAccountIfscCode: string;
  bankAccountName: string;
  bankAccountNumber: string;
  contactEmail?: string;
  contactPhone: string;
  panNumber?: string;
}

export interface SeedVendor {
  createdAt?: Date;
  createdBy: string;
  gstNumber?: string;
  id: string;
  name: string;
  private?: SeedVendorPrivate;
  status: VendorStatus;
  updatedAt?: Date;
}

/**
 * Idempotently seeds a vendor the way `saveVendor` stores one: party, vendor
 * role, supplier profile and, when given, encrypted private and bank rows.
 * Without DATA_ENCRYPTION_KEY the PAN and bank account are left out.
 */
export async function ensureVendor(input: SeedVendor): Promise<void> {
  const createdAt = input.createdAt ?? new Date();
  const updatedAt = input.updatedAt ?? createdAt;
  await db
    .insert(party)
    .values({
      createdAt,
      createdBy: input.createdBy,
      displayName: input.name,
      id: input.id,
      kind: "organisation",
      updatedAt,
    })
    .onConflictDoNothing();
  await db
    .insert(partyRole)
    .values({
      active: true,
      id: uuidv7(),
      partyId: input.id,
      role: "vendor",
      since: createdAt,
    })
    .onConflictDoNothing();
  await db
    .insert(vendor)
    .values({
      createdAt,
      createdBy: input.createdBy,
      gstNumber: input.gstNumber ?? null,
      id: input.id,
      name: input.name,
      status: input.status,
      updatedAt,
    })
    .onConflictDoNothing();

  const details = input.private;
  if (!details) {
    return;
  }
  const canEncrypt = hasEncryptionKey();
  const [existingPrivate] = await db
    .select({ partyId: partyPrivate.partyId })
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, input.id))
    .limit(1);
  if (!existingPrivate) {
    const pan = canEncrypt ? details.panNumber : undefined;
    await db.insert(partyPrivate).values({
      addressLine1: details.address ?? null,
      email: details.contactEmail ?? null,
      idNumberEncrypted: pan
        ? encryptSecret(pan, partyIdNumberContext(input.id))
        : null,
      idNumberLast4: pan ? visibleTail(pan) : null,
      idType: pan ? "pan" : "none",
      partyId: input.id,
      phone: details.contactPhone,
      updatedAt,
      updatedBy: input.createdBy,
    });
  }
  const [existingAccount] = await db
    .select({ id: partyBankAccount.id })
    .from(partyBankAccount)
    .where(eq(partyBankAccount.partyId, input.id))
    .limit(1);
  if (!existingAccount && canEncrypt) {
    const accountId = uuidv7();
    await db.insert(partyBankAccount).values({
      accountName: details.bankAccountName,
      accountNumberEncrypted: encryptSecret(
        details.bankAccountNumber,
        accountNumberContext(accountId)
      ),
      accountNumberLast4: visibleTail(details.bankAccountNumber) ?? "",
      active: true,
      createdAt,
      id: accountId,
      ifscCode: details.bankAccountIfscCode,
      partyId: input.id,
      updatedAt,
    });
  }
}
