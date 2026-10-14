import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { RETURN_REGISTRATION_CONFIG_KEY } from "@pi-dash/shared/donations-return";
import { RECEIPT_SETTINGS_CONFIG_KEY } from "@pi-dash/shared/receipts";
import { SQL } from "bun";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { encryptSecret } from "./encryption";
import {
  allocateReceiptSequence,
  issueReceiptsIn,
  ReceiptError,
  type ReceiptTx,
  voidReceiptIn,
} from "./queries/contribution-receipts";
import { partyIdNumberContext } from "./queries/party-private";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "./schema";
import { appConfig } from "./schema/app-config";
import { user } from "./schema/auth";
import { contributionReceipt } from "./schema/contribution-receipt";
import { orgAccount } from "./schema/finance-dimensions";
import { contribution } from "./schema/income";
import { party } from "./schema/party";
import { partyPrivate } from "./schema/private/party-private";
import {
  contributionReceiptCounter,
  contributionReceiptSnapshot,
} from "./schema/private/receipts";

/**
 * Database-backed checks of receipt numbering. Opt in with
 * RECEIPT_TEST_DATABASE_URL pointing at a local, migrated and seeded database
 * (a worktree's isolated database) and DATA_ENCRYPTION_KEY set. Synthetic
 * records only; receipts are issued in far-future financial years so they
 * never meet a real series. Most tests roll back; the concurrency test
 * commits and removes its rows afterwards.
 */

const databaseUrl = process.env.RECEIPT_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

function connect(max = 1) {
  const client = new SQL(databaseUrl as string, { max });
  return { client, database: drizzle({ client, schema }) };
}

async function inRolledBackTransaction(run: (tx: ReceiptTx) => Promise<void>) {
  const { client, database } = connect();
  try {
    await database.transaction(async (tx) => {
      await run(tx as unknown as ReceiptTx);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

// Issue dates in India: FY 2097-98 and FY 2098-99.
const NOW = new Date("2097-06-01T06:00:00Z");
const NEXT_YEAR = new Date("2098-04-02T06:00:00Z");
const FY = "2097-98";

const SETTINGS = JSON.stringify({
  orgAddress: "1 Test Road, Testville 560001",
  orgName: "Test Trust",
  orgPan: "AAATT0000T",
  signatoryDesignation: "Test Treasurer",
  signatoryName: "Test Signatory",
});
const REGISTRATION = JSON.stringify({
  sectionCode: "Section 80G",
  urn: "TESTURN0000",
  urnIssuedOn: "2025-01-01",
});

type Db = ReturnType<typeof connect>["database"] | ReceiptTx;

/**
 * The test's settings. Rolled-back tests overwrite whatever is stored;
 * committed tests only add what is missing (and remove it afterwards).
 */
async function ensureSettings(tx: Db, overwrite: boolean) {
  const existing = await tx
    .select({ key: appConfig.key })
    .from(appConfig)
    .where(
      inArray(appConfig.key, [
        RECEIPT_SETTINGS_CONFIG_KEY,
        RETURN_REGISTRATION_CONFIG_KEY,
      ])
    );
  const added: string[] = [];
  for (const [key, value] of [
    [RECEIPT_SETTINGS_CONFIG_KEY, SETTINGS],
    [RETURN_REGISTRATION_CONFIG_KEY, REGISTRATION],
  ] as const) {
    if (!existing.some((row) => row.key === key)) {
      await tx.insert(appConfig).values({ key, updatedAt: NOW, value });
      added.push(key);
    } else if (overwrite) {
      await tx
        .update(appConfig)
        .set({ updatedAt: NOW, value })
        .where(eq(appConfig.key, key));
    }
  }
  return added;
}

interface Fixture {
  accountId: string;
  /** app_config keys this fixture added. */
  addedConfig: string[];
  actorId: string;
  partyIds: string[];
}

async function donor(
  tx: Db,
  fixture: Fixture,
  options: { address?: boolean; optOut?: boolean; pan?: string | null } = {}
) {
  const id = uuidv7();
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: `Receipt test donor ${id}`,
    id,
    kind: "person",
    taxCertificateOptOut: options.optOut ?? false,
    updatedAt: NOW,
  });
  const pan = options.pan === undefined ? "ABCPE1234F" : options.pan;
  await tx.insert(partyPrivate).values({
    addressLine1: options.address === false ? null : "2 Test Lane",
    city: "Testville",
    idNumberEncrypted: pan
      ? encryptSecret(pan, partyIdNumberContext(id))
      : null,
    idNumberLast4: pan ? pan.slice(-4) : null,
    idType: pan ? "pan" : "none",
    partyId: id,
    pincode: options.address === false ? null : "560001",
    updatedAt: NOW,
  });
  fixture.partyIds.push(id);
  return id;
}

async function gift(
  tx: Db,
  fixture: Fixture,
  partyId: string,
  overrides: Partial<typeof contribution.$inferInsert> = {}
) {
  const id = uuidv7();
  await tx.insert(contribution).values({
    amountPaise: 12_505_050,
    channel: "upi",
    createdAt: NOW,
    fundId: GENERAL_FUND_ID,
    id,
    orgAccountId: fixture.accountId,
    partyId,
    receivedOn: "2026-05-01",
    reportingMode: "electronic_or_account_payee",
    updatedAt: NOW,
    ...overrides,
  });
  return id;
}

async function foundation(tx: Db, committed = false): Promise<Fixture> {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const accountId = uuidv7();
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: accountId,
    kind: "bank",
    name: `Receipt test bank ${accountId}`,
    updatedAt: NOW,
  });
  const addedConfig = await ensureSettings(tx, !committed);
  return { accountId, actorId: someone.id, addedConfig, partyIds: [] };
}

const statusOf = async (tx: Db, id: string) =>
  (
    await tx
      .select({ status: contribution.status })
      .from(contribution)
      .where(eq(contribution.id, id))
  )[0]?.status;

it.skipIf(!localDatabase)(
  "numbers receipts in a gap-free series per year and never reuses a voided number",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await foundation(tx);
      const person = await donor(tx, fixture);
      const a = await gift(tx, fixture, person, { receivedOn: "2026-05-02" });
      const b = await gift(tx, fixture, person, { receivedOn: "2026-05-01" });
      const first = await issueReceiptsIn(
        tx,
        { actorId: fixture.actorId, contributionIds: [a, b] },
        { now: NOW }
      );
      // Date order: b was received first.
      expect(first.issued.map((r) => [r.contributionId, r.number])).toEqual([
        [b, `PI/${FY}/0001`],
        [a, `PI/${FY}/0002`],
      ]);
      expect(await statusOf(tx, a)).toBe("receipted");

      // Issuing again does nothing: both already have a live receipt.
      const again = await issueReceiptsIn(
        tx,
        { actorId: fixture.actorId, contributionIds: [a] },
        { now: NOW }
      );
      expect(again.issued).toEqual([]);
      expect(again.skipped).toEqual([
        { contributionId: a, reason: "receipted" },
      ]);

      // Void keeps the number; the gift returns to received.
      const voidedId = first.issued[1]?.id as string;
      await voidReceiptIn(
        tx,
        {
          actorId: fixture.actorId,
          reason: "Wrong donor",
          receiptId: voidedId,
        },
        { now: NOW }
      );
      expect(await statusOf(tx, a)).toBe("received");
      const [voided] = await tx
        .select()
        .from(contributionReceipt)
        .where(eq(contributionReceipt.id, voidedId));
      expect(voided?.number).toBe(`PI/${FY}/0002`);
      expect(voided?.voidReason).toBe("Wrong donor");
      await expect(
        voidReceiptIn(
          tx,
          {
            actorId: fixture.actorId,
            reason: "Again please",
            receiptId: voidedId,
          },
          { now: NOW }
        )
      ).rejects.toThrow("already voided");

      // Receipted again under a new number.
      const reissued = await issueReceiptsIn(
        tx,
        { actorId: fixture.actorId, contributionIds: [a] },
        { now: NOW }
      );
      expect(reissued.issued[0]?.number).toBe(`PI/${FY}/0003`);

      // A new financial year starts its own series at 0001.
      const c = await gift(tx, fixture, person);
      const next = await issueReceiptsIn(
        tx,
        { actorId: fixture.actorId, contributionIds: [c] },
        { now: NEXT_YEAR }
      );
      expect(next.issued[0]?.number).toBe("PI/2098-99/0001");
    });
  }
);

it.skipIf(!localDatabase)(
  "gives a rolled-back number back to the series",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      await tx
        .transaction(async (savepoint) => {
          await allocateReceiptSequence(
            savepoint as unknown as ReceiptTx,
            FY,
            NOW
          );
          await allocateReceiptSequence(
            savepoint as unknown as ReceiptTx,
            FY,
            NOW
          );
          savepoint.rollback();
        })
        .catch(() => undefined);
      expect(await allocateReceiptSequence(tx, FY, NOW)).toBe(1);
    });
  }
);

it.skipIf(!localDatabase)(
  "applies the eligibility rules and freezes what the PDF prints",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await foundation(tx);
      const complete = await donor(tx, fixture);
      const noAddress = await donor(tx, fixture, { address: false });
      const optedOut = await donor(tx, fixture, { optOut: true, pan: null });
      const noId = await donor(tx, fixture, { pan: null });
      const ok = await gift(tx, fixture, complete);
      const gateway = await gift(tx, fixture, complete, {
        channel: "razorpay",
      });
      const early = await gift(tx, fixture, complete, {
        receivedOn: "2026-03-31",
      });
      const blockedAddress = await gift(tx, fixture, noAddress);
      const withoutLine = await gift(tx, fixture, optedOut);
      const blockedId = await gift(tx, fixture, noId);
      const pending = await gift(tx, fixture, complete, { status: "pending" });
      const result = await issueReceiptsIn(
        tx,
        {
          actorId: fixture.actorId,
          contributionIds: [
            ok,
            gateway,
            early,
            blockedAddress,
            withoutLine,
            blockedId,
            pending,
          ],
        },
        { now: NOW }
      );
      expect(result.issued.map((r) => r.contributionId).sort()).toEqual(
        [ok, withoutLine].sort()
      );
      const reasons = Object.fromEntries(
        result.skipped.map((s) => [s.contributionId, s.reason])
      );
      expect(reasons).toEqual({
        [blockedAddress]: "missing_address",
        [blockedId]: "missing_id",
        [early]: "before_start",
        [gateway]: "external",
        [pending]: "pending",
      });
      expect(await statusOf(tx, gateway)).toBe("received");

      const snapshots = await tx
        .select({
          contributionId: contributionReceipt.contributionId,
          document: contributionReceiptSnapshot.document,
          idNumberEncrypted: contributionReceiptSnapshot.idNumberEncrypted,
        })
        .from(contributionReceiptSnapshot)
        .innerJoin(
          contributionReceipt,
          eq(contributionReceipt.id, contributionReceiptSnapshot.receiptId)
        )
        .where(inArray(contributionReceipt.contributionId, [ok, withoutLine]));
      const byGift = new Map(snapshots.map((s) => [s.contributionId, s]));
      expect(byGift.get(ok)?.document).toMatchObject({
        donor: { idType: "pan" },
        gift: { amountPaise: 12_505_050 },
        org: { pan: "AAATT0000T" },
        with80G: true,
      });
      expect(byGift.get(ok)?.idNumberEncrypted).toBeTruthy();
      expect(byGift.get(withoutLine)?.document).toMatchObject({
        donor: { idType: null },
        with80G: false,
      });
      expect(byGift.get(withoutLine)?.idNumberEncrypted).toBeNull();
    });
  }
);

/** Removes what a committed test wrote, in foreign-key order. */
async function removeCommitted(
  database: ReturnType<typeof connect>["database"],
  fixture: Fixture,
  gifts: string[]
) {
  const receipts = await database
    .select({ id: contributionReceipt.id })
    .from(contributionReceipt)
    .where(inArray(contributionReceipt.contributionId, gifts));
  const receiptIds = receipts.map((r) => r.id);
  if (receiptIds.length > 0) {
    await database
      .delete(contributionReceiptSnapshot)
      .where(inArray(contributionReceiptSnapshot.receiptId, receiptIds));
    await database
      .delete(contributionReceipt)
      .where(inArray(contributionReceipt.id, receiptIds));
  }
  await database
    .delete(contributionReceiptCounter)
    .where(eq(contributionReceiptCounter.fiscalYear, FY));
  if (gifts.length > 0) {
    await database.delete(contribution).where(inArray(contribution.id, gifts));
  }
  if (fixture.partyIds.length > 0) {
    await database
      .delete(partyPrivate)
      .where(inArray(partyPrivate.partyId, fixture.partyIds));
    await database.delete(party).where(inArray(party.id, fixture.partyIds));
  }
  await database.delete(orgAccount).where(eq(orgAccount.id, fixture.accountId));
  if (fixture.addedConfig.length > 0) {
    await database
      .delete(appConfig)
      .where(inArray(appConfig.key, fixture.addedConfig));
  }
}

it.skipIf(!localDatabase)(
  "never duplicates or skips a number when issues run in parallel",
  async () => {
    const { client, database } = connect(6);
    const fixture: Fixture = await database.transaction(async (tx) =>
      foundation(tx as unknown as ReceiptTx, true)
    );
    const gifts: string[] = [];
    try {
      await database.transaction(async (tx) => {
        const person = await donor(tx as unknown as ReceiptTx, fixture);
        for (let i = 0; i < 12; i++) {
          gifts.push(await gift(tx as unknown as ReceiptTx, fixture, person));
        }
      });
      // Four parallel issues: three disjoint batches and one overlapping.
      const batches = [
        gifts.slice(0, 4),
        gifts.slice(4, 8),
        gifts.slice(8, 12),
        gifts.slice(2, 6),
      ];
      const results = await Promise.all(
        batches.map((ids) =>
          database.transaction((tx) =>
            issueReceiptsIn(
              tx as unknown as ReceiptTx,
              { actorId: fixture.actorId, contributionIds: ids },
              { now: NOW }
            )
          )
        )
      );
      const numbers = results
        .flatMap((result) => result.issued.map((r) => r.number))
        .sort();
      expect(numbers).toEqual(
        Array.from(
          { length: 12 },
          (_, i) => `PI/${FY}/${String(i + 1).padStart(4, "0")}`
        )
      );
      const receipted = results.flatMap((result) =>
        result.issued.map((r) => r.contributionId)
      );
      expect(new Set(receipted).size).toBe(12);
    } finally {
      await removeCommitted(database, fixture, gifts);
      await client.close();
    }
  }
);

it.skipIf(!localDatabase)(
  "rolls every number of a batch back when the batch fails",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const fixture = await foundation(tx);
      const person = await donor(tx, fixture);
      const a = await gift(tx, fixture, person);
      const b = await gift(tx, fixture, person);
      // The server function runs one transaction per batch; any error after
      // numbers were allocated (here a refusal raised once both are issued)
      // undoes all of them.
      await tx
        .transaction(async (batch) => {
          const result = await issueReceiptsIn(
            batch as unknown as ReceiptTx,
            { actorId: fixture.actorId, contributionIds: [a, b] },
            { now: NOW }
          );
          expect(result.issued).toHaveLength(2);
          throw new ReceiptError("Refused mid-batch");
        })
        .catch((error: unknown) => {
          expect(error).toBeInstanceOf(ReceiptError);
        });
      expect(await statusOf(tx, a)).toBe("received");
      const receipts = await tx
        .select({ id: contributionReceipt.id })
        .from(contributionReceipt)
        .where(inArray(contributionReceipt.contributionId, [a, b]));
      expect(receipts).toEqual([]);
      const next = await issueReceiptsIn(
        tx,
        { actorId: fixture.actorId, contributionIds: [a] },
        { now: NOW }
      );
      expect(next.issued[0]?.number).toBe(`PI/${FY}/0001`);
    });
  }
);

it.skipIf(!localDatabase)(
  "an issue racing a void waits for it and receipts the gift afresh",
  async () => {
    const { client, database } = connect(4);
    const fixture: Fixture = await database.transaction(async (tx) =>
      foundation(tx as unknown as ReceiptTx, true)
    );
    const gifts: string[] = [];
    try {
      await database.transaction(async (tx) => {
        const person = await donor(tx as unknown as ReceiptTx, fixture);
        gifts.push(await gift(tx as unknown as ReceiptTx, fixture, person));
      });
      const [giftId] = gifts as [string];
      const first = await database.transaction((tx) =>
        issueReceiptsIn(
          tx as unknown as ReceiptTx,
          { actorId: fixture.actorId, contributionIds: [giftId] },
          { now: NOW }
        )
      );
      const receiptId = first.issued[0]?.id as string;

      // The void holds the gift's row lock until it commits; the issue
      // started meanwhile waits, then sees the gift Received again.
      const release = Promise.withResolvers<void>();
      const voided = Promise.withResolvers<void>();
      const voiding = database.transaction(async (tx) => {
        await voidReceiptIn(
          tx as unknown as ReceiptTx,
          { actorId: fixture.actorId, reason: "Wrong donor", receiptId },
          { now: NOW }
        );
        voided.resolve();
        await release.promise;
      });
      await voided.promise;
      const issuing = database.transaction((tx) =>
        issueReceiptsIn(
          tx as unknown as ReceiptTx,
          { actorId: fixture.actorId, contributionIds: [giftId] },
          { now: NOW }
        )
      );
      // Give the issue time to block on the lock before the void commits.
      await Bun.sleep(200);
      release.resolve();
      await voiding;
      const second = await issuing;
      expect(second.issued.map((r) => r.number)).toEqual([`PI/${FY}/0002`]);
      const live = await database
        .select({ id: contributionReceipt.id })
        .from(contributionReceipt)
        .where(eq(contributionReceipt.contributionId, giftId));
      expect(live).toHaveLength(2);
      expect(await statusOf(database, giftId)).toBe("receipted");
    } finally {
      await removeCommitted(database, fixture, gifts);
      await client.close();
    }
  }
);
