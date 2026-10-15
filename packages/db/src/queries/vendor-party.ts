import { and, desc, eq, ne, or } from "drizzle-orm";
import { uuidv7 } from "uuidv7";

import { db } from "..";
import {
  revealSecret,
  encryptSecret,
  hasEncryptionKey,
  visibleTail,
} from "../encryption";
import { accountNumberContext } from "../encryption-contexts";
import {
  PartyConflictError,
  resolveBankAccount,
  resolveSaveMode,
  resolveSecret,
} from "../party-save-rules";
import { user } from "../schema/auth";
import { project } from "../schema/finance-dimensions";
import { party, partyRole } from "../schema/party";
import {
  partyBankAccount,
  partyPrivate,
} from "../schema/private/party-private";
import { vendorLegacyDetails } from "../schema/private/vendor-legacy";
import { vendor, vendorPayment } from "../schema/vendor";
import {
  lockPartyId,
  nullIfBlank,
  partyIdNumberContext,
} from "./party-private";
import { assertKeyOpensStoredData } from "./secrets-rekey";

/*
 * Lock order. Every writer of a vendor's rows (saveParty in party-private.ts,
 * saveVendor, deleteVendor, backfillVendorPrivate) first takes
 * `pg_advisory_xact_lock(hashtext(id))` and then `party FOR UPDATE`. Those two
 * locks are what serialise them: the advisory lock covers creates, before any
 * row exists to lock, and whoever holds the party row holds the vendor.
 *
 * The order of the later locks is listed for consistency:
 *
 *   3. `vendor`
 *   4. `vendor_legacy_details`
 *   5. `party_private`
 *   6. `party_bank_account`
 *
 * saveParty locks `party_private` before it touches the `vendor` row, against
 * this order. That is safe because it already holds the party lock, so no
 * other writer can be holding the later rows.
 */

export { PartyConflictError };

/** Associated data binding an encrypted account number to its account row. */
export { accountNumberContext };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Tx;

/** What vendor screens may show: contact details, masked PAN and bank account. */
export interface VendorPrivateView {
  address: string | null;
  bank: {
    accountName: string;
    accountNumberLast4: string | null;
    id: string;
    ifscCode: string;
  } | null;
  email: string | null;
  hasPan: boolean;
  /** True while the details still sit in the pre-party legacy table. */
  legacy: boolean;
  panLast4: string | null;
  partyId: string;
  phone: string | null;
  /** The private row's updatedAt, for the editor's version check; null when there is none. */
  updatedAt: number | null;
}

type PrivateRow = typeof partyPrivate.$inferSelect;
type BankRow = typeof partyBankAccount.$inferSelect;
type LegacyRow = typeof vendorLegacyDetails.$inferSelect;

function toView(
  vendorId: string,
  priv: PrivateRow | null,
  bank: BankRow | null
): VendorPrivateView {
  return {
    address: priv?.addressLine1 ?? null,
    bank: bank
      ? {
          accountName: bank.accountName,
          accountNumberLast4: bank.accountNumberLast4 || null,
          id: bank.id,
          ifscCode: bank.ifscCode,
        }
      : null,
    email: priv?.email ?? null,
    hasPan: priv?.idType === "pan" && priv.idNumberEncrypted !== null,
    legacy: false,
    panLast4: priv?.idType === "pan" ? priv.idNumberLast4 : null,
    partyId: vendorId,
    phone: priv?.phone ?? null,
    updatedAt: priv ? priv.updatedAt.getTime() : null,
  };
}

function legacyView(row: LegacyRow): VendorPrivateView {
  const pan = row.panNumber?.trim().toUpperCase() || null;
  return {
    address: row.address,
    bank: {
      accountName: row.bankAccountName,
      accountNumberLast4: visibleTail(row.bankAccountNumber.trim()),
      // The legacy row has no account ID of its own; it is keyed by vendor.
      id: row.vendorId,
      ifscCode: row.bankAccountIfscCode,
    },
    email: row.contactEmail,
    hasPan: pan !== null,
    legacy: true,
    panLast4: pan ? visibleTail(pan) : null,
    partyId: row.vendorId,
    phone: row.contactPhone,
    updatedAt: null,
  };
}

async function loadPrivate(executor: Executor, vendorId: string) {
  const [priv] = await executor
    .select()
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, vendorId))
    .limit(1);
  const [bank] = await executor
    .select()
    .from(partyBankAccount)
    .where(
      and(
        eq(partyBankAccount.partyId, vendorId),
        eq(partyBankAccount.active, true)
      )
    )
    .orderBy(desc(partyBankAccount.createdAt))
    .limit(1);
  return { bank: bank ?? null, priv: priv ?? null };
}

async function readView(
  executor: Executor,
  vendorId: string
): Promise<VendorPrivateView | null> {
  const { bank, priv } = await loadPrivate(executor, vendorId);
  if (priv || bank) {
    return toView(vendorId, priv, bank);
  }
  const [legacy] = await executor
    .select()
    .from(vendorLegacyDetails)
    .where(eq(vendorLegacyDetails.vendorId, vendorId))
    .limit(1);
  return legacy ? legacyView(legacy) : null;
}

export async function getVendorPrivate(
  vendorId: string
): Promise<VendorPrivateView | null> {
  return await readView(db, vendorId);
}

/** The full bank account, for the people who pay the vendor. */
export async function revealVendorBankAccount(vendorId: string): Promise<{
  accountName: string;
  accountNumber: string;
  ifscCode: string;
} | null> {
  const { bank } = await loadPrivate(db, vendorId);
  if (bank) {
    return {
      accountName: bank.accountName,
      accountNumber: revealSecret(
        bank.accountNumberEncrypted,
        accountNumberContext(bank.id)
      ),
      ifscCode: bank.ifscCode,
    };
  }
  const [legacy] = await db
    .select()
    .from(vendorLegacyDetails)
    .where(eq(vendorLegacyDetails.vendorId, vendorId))
    .limit(1);
  return legacy
    ? {
        accountName: legacy.bankAccountName,
        accountNumber: legacy.bankAccountNumber,
        ifscCode: legacy.bankAccountIfscCode,
      }
    : null;
}

function requireKey(): void {
  if (!hasEncryptionKey()) {
    throw new Error(
      "Bank and tax details cannot be stored right now; ask an administrator to configure encryption"
    );
  }
}

/** Encrypts an account number into a new account row the caller inserts. */
function newBankAccount(
  vendorId: string,
  accountNumber: string,
  details: { accountName: string; ifscCode: string },
  now: Date
): typeof partyBankAccount.$inferInsert {
  requireKey();
  const id = uuidv7();
  return {
    accountName: details.accountName,
    accountNumberEncrypted: encryptSecret(
      accountNumber,
      accountNumberContext(id)
    ),
    accountNumberLast4: visibleTail(accountNumber) ?? "",
    active: true,
    createdAt: now,
    id,
    ifscCode: details.ifscCode,
    partyId: vendorId,
    updatedAt: now,
  };
}

function encryptPan(vendorId: string, plain: string) {
  requireKey();
  return {
    encrypted: encryptSecret(plain, partyIdNumberContext(vendorId)),
    last4: visibleTail(plain),
  };
}

export interface SaveVendorInput {
  address: string;
  bankAccountIfscCode: string;
  bankAccountName: string;
  /** Blank keeps the active account; a value replaces it. */
  bankAccountNumber: string;
  contactEmail: string;
  contactPhone: string;
  /**
   * The vendor row's updatedAt the editor loaded (the synced supplier profile
   * stands in for the party, whose name it mirrors); null on create.
   */
  expectedPartyUpdatedAt: number | null;
  /** The private row's updatedAt the editor loaded; null when it loaded none. */
  expectedUpdatedAt: number | null;
  gstNumber: string;
  /** Client-generated on create so a retried request is idempotent. */
  id: string;
  mode: "create" | "update";
  name: string;
  /** Blank keeps a stored PAN; a value replaces it. */
  panNumber: string;
}

export interface SaveVendorResult {
  created: boolean;
  vendorId: string;
  view: VendorPrivateView;
}

/**
 * Create or update a vendor: its party, vendor role, supplier profile, private
 * details and active bank account, in one transaction with every row it reads
 * locked. A vendor whose details still sit in the legacy table is migrated by
 * the same save. Replaced bank accounts stay as inactive history.
 */
export async function saveVendor(
  input: SaveVendorInput,
  actorId: string
): Promise<SaveVendorResult> {
  const now = new Date();
  const vendorId = input.id;
  const name = input.name.trim();

  return await db.transaction(async (tx) => {
    await lockPartyId(tx, vendorId);
    const [existingParty] = await tx
      .select()
      .from(party)
      .where(eq(party.id, vendorId))
      .limit(1)
      .for("update");
    const [existingVendor] = await tx
      .select()
      .from(vendor)
      .where(eq(vendor.id, vendorId))
      .limit(1)
      .for("update");
    const [legacy] = await tx
      .select()
      .from(vendorLegacyDetails)
      .where(eq(vendorLegacyDetails.vendorId, vendorId))
      .limit(1)
      .for("update");
    const [existingPrivate] = await tx
      .select()
      .from(partyPrivate)
      .where(eq(partyPrivate.partyId, vendorId))
      .limit(1)
      .for("update");
    const activeAccounts = await tx
      .select()
      .from(partyBankAccount)
      .where(
        and(
          eq(partyBankAccount.partyId, vendorId),
          eq(partyBankAccount.active, true)
        )
      )
      .orderBy(desc(partyBankAccount.createdAt))
      .for("update");

    if (existingParty && !existingVendor) {
      // A donor or other party already owns this ID.
      throw new PartyConflictError("A vendor with this ID already exists");
    }
    const mode = resolveSaveMode(
      {
        actorId,
        expectedPartyUpdatedAt: input.expectedPartyUpdatedAt,
        expectedUpdatedAt: input.expectedUpdatedAt,
        mode: input.mode,
      },
      existingVendor ?? null,
      existingPrivate ?? null,
      "vendor"
    );
    if (mode.kind === "retry") {
      const view = await readView(tx, vendorId);
      if (!view) {
        throw new Error("Vendor details could not be saved");
      }
      return { created: true, vendorId, view };
    }

    const gstNumber = nullIfBlank(input.gstNumber)?.toUpperCase() ?? null;
    if (mode.kind === "update") {
      await tx
        .update(party)
        .set({ displayName: name, updatedAt: now })
        .where(eq(party.id, vendorId));
      await tx
        .update(vendor)
        .set({ gstNumber, name, updatedAt: now })
        .where(eq(vendor.id, vendorId));
    } else {
      await tx.insert(party).values({
        createdAt: now,
        createdBy: actorId,
        displayName: name,
        id: vendorId,
        kind: "organisation",
        updatedAt: now,
      });
      await tx.insert(vendor).values({
        createdAt: now,
        createdBy: actorId,
        gstNumber,
        id: vendorId,
        name,
        status: "pending",
        updatedAt: now,
      });
    }
    await tx
      .insert(partyRole)
      .values({
        active: true,
        id: uuidv7(),
        partyId: vendorId,
        role: "vendor",
        since: now,
      })
      .onConflictDoUpdate({
        set: { active: true },
        target: [partyRole.partyId, partyRole.role],
      });

    // Details still in the legacy table are carried over when nothing newer exists.
    const migrating =
      legacy !== undefined && !existingPrivate && activeAccounts.length === 0;

    let panNumber = input.panNumber.trim().toUpperCase();
    if (!panNumber && migrating && legacy.panNumber?.trim()) {
      panNumber = legacy.panNumber.trim().toUpperCase();
    }
    let idType = existingPrivate?.idNumberEncrypted
      ? existingPrivate.idType
      : "none";
    if (panNumber) {
      idType = "pan";
    }
    const secret = resolveSecret(
      { idNumber: panNumber, idType },
      existingPrivate ?? null,
      (plain) => encryptPan(vendorId, plain)
    );

    const values = {
      addressLine1: nullIfBlank(input.address),
      email: nullIfBlank(input.contactEmail),
      idNumberEncrypted: secret.idNumberEncrypted,
      idNumberLast4: secret.idNumberLast4,
      idType,
      phone: nullIfBlank(input.contactPhone),
    };
    await tx
      .insert(partyPrivate)
      .values({
        ...values,
        partyId: vendorId,
        updatedAt: now,
        updatedBy: actorId,
      })
      .onConflictDoUpdate({
        set: { ...values, updatedAt: now, updatedBy: actorId },
        target: partyPrivate.partyId,
      });

    const bankDetails = {
      accountName: input.bankAccountName.trim(),
      ifscCode: input.bankAccountIfscCode.trim().toUpperCase(),
    };
    const plan = resolveBankAccount(
      input.bankAccountNumber,
      activeAccounts[0] ?? null,
      migrating ? legacy.bankAccountNumber : null
    );
    if (plan.kind === "replace") {
      await tx
        .update(partyBankAccount)
        .set({ active: false, updatedAt: now })
        .where(
          and(
            eq(partyBankAccount.partyId, vendorId),
            eq(partyBankAccount.active, true)
          )
        );
      await tx
        .insert(partyBankAccount)
        .values(newBankAccount(vendorId, plan.accountNumber, bankDetails, now));
    } else {
      await tx
        .update(partyBankAccount)
        .set({ ...bankDetails, updatedAt: now })
        .where(eq(partyBankAccount.id, plan.accountId));
    }

    if (legacy) {
      await tx
        .delete(vendorLegacyDetails)
        .where(eq(vendorLegacyDetails.vendorId, vendorId));
    }

    const view = await readView(tx, vendorId);
    if (!view) {
      throw new Error("Vendor details could not be saved");
    }
    return { created: mode.kind === "create", vendorId, view };
  });
}

/** What a delete removed: the whole party, or only its vendor side. */
export type DeleteVendorOutcome = "party" | "vendor";

/**
 * Removes a vendor. Refused while any payment request points at it, because
 * payment history must keep its counterparty. A party that holds another
 * active role (a donor who also supplies goods) keeps its party and private
 * rows; only the vendor row, its vendor role and its bank accounts go.
 */
/**
 * Projects and logins point at a party with restricting foreign keys; refuse
 * the delete with a readable message instead of a 23503 from Postgres.
 */
async function assertPartyUnreferenced(tx: Tx, partyId: string) {
  const [projectRef] = await tx
    .select({ id: project.id })
    .from(project)
    .where(
      or(
        eq(project.sponsorPartyId, partyId),
        eq(project.intermediaryPartyId, partyId)
      )
    )
    .limit(1);
  const [userRef] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.partyId, partyId))
    .limit(1);
  if (projectRef || userRef) {
    throw new Error(
      "This vendor is linked to a project or user; unlink it first"
    );
  }
}

export async function deleteVendor(
  vendorId: string
): Promise<DeleteVendorOutcome> {
  return await db.transaction(async (tx) => {
    await lockPartyId(tx, vendorId);
    await tx
      .select({ id: party.id })
      .from(party)
      .where(eq(party.id, vendorId))
      .limit(1)
      .for("update");
    const [existing] = await tx
      .select({ id: vendor.id })
      .from(vendor)
      .where(eq(vendor.id, vendorId))
      .limit(1)
      .for("update");
    if (!existing) {
      throw new Error("Vendor not found");
    }
    const [payment] = await tx
      .select({ id: vendorPayment.id })
      .from(vendorPayment)
      .where(eq(vendorPayment.vendorId, vendorId))
      .limit(1);
    if (payment) {
      throw new Error("Cannot delete vendor with existing payment requests");
    }
    // Any other role, even an inactive one, keeps the party: its history
    // (a lapsed donor, say) still belongs to that identity.
    const [otherRole] = await tx
      .select({ id: partyRole.id })
      .from(partyRole)
      .where(and(eq(partyRole.partyId, vendorId), ne(partyRole.role, "vendor")))
      .limit(1);
    if (!otherRole) {
      await assertPartyUnreferenced(tx, vendorId);
    }

    await tx
      .delete(vendorLegacyDetails)
      .where(eq(vendorLegacyDetails.vendorId, vendorId));
    await tx.delete(vendor).where(eq(vendor.id, vendorId));
    // Deleted for the whole party because only vendors store bank accounts
    // today. Once donors get bank details the rows need a purpose column, and
    // this delete must be scoped to the vendor's accounts.
    await tx
      .delete(partyBankAccount)
      .where(eq(partyBankAccount.partyId, vendorId));
    if (otherRole) {
      await tx
        .delete(partyRole)
        .where(
          and(eq(partyRole.partyId, vendorId), eq(partyRole.role, "vendor"))
        );
      return "vendor";
    }
    await tx.delete(partyPrivate).where(eq(partyPrivate.partyId, vendorId));
    await tx.delete(partyRole).where(eq(partyRole.partyId, vendorId));
    await tx.delete(party).where(eq(party.id, vendorId));
    return "party";
  });
}

export interface BackfillVendorPrivateResult {
  /** Legacy rows whose details were encrypted into the party tables. */
  migrated: number;
  /** Legacy rows dropped because newer party details already existed. */
  skipped: number;
}

/**
 * Encrypts every remaining `vendor_legacy_details` row into `party_private`
 * and `party_bank_account`, then deletes it. Rows of vendors that already have
 * party details are deleted without copying, since the newer details win.
 * Safe to run again: processed rows are gone.
 */
export async function backfillVendorPrivate(): Promise<BackfillVendorPrivateResult> {
  requireKey();
  // Refuse to add values under a key that opens none of those already stored.
  await assertKeyOpensStoredData(db);
  const rows = await db
    .select({ vendorId: vendorLegacyDetails.vendorId })
    .from(vendorLegacyDetails);
  let migrated = 0;
  let skipped = 0;
  for (const { vendorId } of rows) {
    const outcome = await db.transaction(async (tx) => {
      // Same first locks as saveVendor, so the two queue instead of deadlocking.
      await lockPartyId(tx, vendorId);
      await tx
        .select({ id: party.id })
        .from(party)
        .where(eq(party.id, vendorId))
        .limit(1)
        .for("update");
      const [legacy] = await tx
        .select()
        .from(vendorLegacyDetails)
        .where(eq(vendorLegacyDetails.vendorId, vendorId))
        .limit(1)
        .for("update");
      if (!legacy) {
        return null;
      }
      const [existingPrivate] = await tx
        .select({ partyId: partyPrivate.partyId })
        .from(partyPrivate)
        .where(eq(partyPrivate.partyId, vendorId))
        .limit(1)
        .for("update");
      const [existingAccount] = await tx
        .select({ id: partyBankAccount.id })
        .from(partyBankAccount)
        .where(eq(partyBankAccount.partyId, vendorId))
        .limit(1)
        .for("update");
      const now = new Date();
      let result: "migrated" | "skipped" = "skipped";
      if (!existingPrivate) {
        const pan = legacy.panNumber?.trim().toUpperCase() || null;
        const encrypted = pan ? encryptPan(vendorId, pan) : null;
        await tx.insert(partyPrivate).values({
          addressLine1: nullIfBlank(legacy.address ?? ""),
          email: nullIfBlank(legacy.contactEmail ?? ""),
          idNumberEncrypted: encrypted?.encrypted ?? null,
          idNumberLast4: encrypted?.last4 ?? null,
          idType: encrypted ? "pan" : "none",
          partyId: vendorId,
          phone: nullIfBlank(legacy.contactPhone),
          updatedAt: now,
        });
        result = "migrated";
      }
      if (!existingAccount && legacy.bankAccountNumber.trim()) {
        await tx.insert(partyBankAccount).values(
          newBankAccount(
            vendorId,
            legacy.bankAccountNumber.trim(),
            {
              accountName: legacy.bankAccountName,
              ifscCode: legacy.bankAccountIfscCode.trim().toUpperCase(),
            },
            now
          )
        );
        result = "migrated";
      }
      await tx
        .delete(vendorLegacyDetails)
        .where(eq(vendorLegacyDetails.vendorId, vendorId));
      return result;
    });
    if (outcome === "migrated") {
      migrated += 1;
    } else if (outcome === "skipped") {
      skipped += 1;
    }
  }
  return { migrated, skipped };
}
