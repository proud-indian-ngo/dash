import { GENERAL_FUND_ID } from "@pi-dash/shared/constants";
import { assessReturn } from "@pi-dash/shared/donations-return";
import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { revealSecret } from "./encryption";
import { filingRowIdContext } from "./encryption-contexts";
import {
  claimCertificateEmails,
  confirmPanCertificates,
  loadFilingDrift,
  FilingError,
  type FilingTx,
  insertFiling,
  loadFiledSequences,
  nextFilingSequence,
  type NewFilingRow,
} from "./queries/donation-filings";
import { loadReturnFacts } from "./queries/donations-return";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "./schema";
import { user } from "./schema/auth";
import { orgAccount } from "./schema/finance-dimensions";
import { contribution, contributionRefund } from "./schema/income";
import { party } from "./schema/party";
import {
  donationCertificate,
  donationFiling,
  donationFilingRow,
} from "./schema/private/donation-filings";
import { partyPrivate } from "./schema/private/party-private";

/**
 * Database-backed checks of filings and certificate email claims. Opt in
 * with FILING_TEST_DATABASE_URL pointing at a local, migrated database with
 * a user (a worktree's isolated database) and DATA_ENCRYPTION_KEY set.
 * Synthetic records in FY 2097-98, every test rolled back.
 */

const databaseUrl = process.env.FILING_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

async function inRolledBackTransaction(run: (tx: FilingTx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await run(tx as unknown as FilingTx);
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

const NOW = new Date("2097-06-01T06:00:00Z");
const FY = "2097-98";

async function fixture(tx: FilingTx) {
  const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
  if (!someone) {
    throw new Error("Seed a user first");
  }
  const accountId = uuidv7();
  await tx.insert(orgAccount).values({
    createdAt: NOW,
    id: accountId,
    kind: "bank",
    name: `Filing test bank ${accountId}`,
    updatedAt: NOW,
  });
  const donor = async (email: string | null) => {
    const id = uuidv7();
    await tx.insert(party).values({
      createdAt: NOW,
      displayName: `Filing test donor ${id}`,
      id,
      kind: "person",
      updatedAt: NOW,
    });
    await tx.insert(partyPrivate).values({
      email,
      idType: "pan",
      partyId: id,
      updatedAt: NOW,
    });
    return id;
  };
  const gift = async (partyId: string) => {
    const id = uuidv7();
    await tx.insert(contribution).values({
      amountPaise: 100_000,
      channel: "upi",
      createdAt: NOW,
      fundId: GENERAL_FUND_ID,
      id,
      orgAccountId: accountId,
      partyId,
      receivedOn: "2097-05-01",
      reportingMode: "electronic_or_account_payee",
      updatedAt: NOW,
    });
    return id;
  };
  return { actorId: someone.id, donor, gift };
}

function planRow(
  partyId: string,
  giftIds: string[],
  srNo: number
): NewFilingRow {
  return {
    address: "1 Test Road, Testville, India, 560001",
    amountPaise: 100_000 * giftIds.length,
    donationTypeCode: "Specific grant",
    giftIds,
    idCode: "Permanent Account Number",
    idNumber: "AAAPT1234T",
    idType: "pan",
    modeCode: "Electronic modes including account payee cheque/draft",
    name: "Filing Test Donor",
    partyId,
    srNo,
  };
}

async function record(
  tx: FilingTx,
  actorId: string,
  rows: NewFilingRow[],
  giftNetPaise?: Map<string, number>
) {
  const id = uuidv7();
  const sequence = await nextFilingSequence(tx, FY);
  await insertFiling(tx, {
    createdBy: actorId,
    giftNetPaise:
      giftNetPaise ??
      new Map(rows.flatMap((row) => row.giftIds.map((id) => [id, 100_000]))),
    file: {
      name: `filing-${sequence}.csv`,
      objectKey: `test/donation-filings/${id}/filing.csv`,
      sha256: "0".repeat(64),
    },
    fiscalYear: FY,
    id,
    now: NOW,
    rows,
    sequence,
  });
  return { id, sequence };
}

it.skipIf(!localDatabase)(
  "freezes rows with an encrypted ID, and never files a gift twice",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { actorId, donor, gift } = await fixture(tx);
      const donorId = await donor("donor@example.test");
      const first = await gift(donorId);
      const second = await gift(donorId);
      const filing = await record(tx, actorId, [planRow(donorId, [first], 1)]);
      const [row] = await tx
        .select()
        .from(donationFilingRow)
        .where(eq(donationFilingRow.filingId, filing.id));
      expect(row?.idNumberEncrypted).not.toContain("AAAPT1234T");
      expect(
        revealSecret(
          row?.idNumberEncrypted ?? "",
          filingRowIdContext(row?.id ?? "")
        )
      ).toBe("AAAPT1234T");

      const filed = await loadFiledSequences(tx);
      expect(filed.get(first)).toEqual({
        amountPaise: 100_000,
        filingSequence: filing.sequence,
      });
      expect(filed.has(second)).toBe(false);

      // A later filing that repeats a filed gift is refused as a whole,
      // naming the gift.
      await expect(
        tx.transaction((inner) =>
          record(inner as unknown as FilingTx, actorId, [
            planRow(donorId, [first, second], 1),
          ])
        )
      ).rejects.toThrow(
        new FilingError(
          `The gift ${first} from Filing Test Donor is already in another filing.`
        )
      );
      const next = await record(tx, actorId, [planRow(donorId, [second], 1)]);
      expect(next.sequence).toBe(filing.sequence + 1);
      expect((await loadFiledSequences(tx)).get(second)?.filingSequence).toBe(
        next.sequence
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "claims each certificate for email once, again only after a failure or on resend",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { actorId, donor } = await fixture(tx);
      const withEmail = await donor("donor@example.test");
      const withoutEmail = await donor(null);
      const filing = await record(tx, actorId, [
        planRow(withEmail, [], 1),
        planRow(withoutEmail, [], 2),
        planRow(withEmail, [], 3),
      ]);
      await tx
        .update(donationFiling)
        .set({
          acknowledgementNumber: "TEST113",
          filedOn: "2097-06-01",
          status: "submitted",
          transactionId: "TESTTXN",
        })
        .where(eq(donationFiling.id, filing.id));
      const rows = await tx
        .select({ id: donationFilingRow.id, srNo: donationFilingRow.srNo })
        .from(donationFilingRow)
        .where(eq(donationFilingRow.filingId, filing.id));
      const certificateIds: string[] = [];
      for (const row of rows.sort((a, b) => a.srNo - b.srNo)) {
        const id = uuidv7();
        certificateIds.push(id);
        await tx.insert(donationCertificate).values({
          acknowledgementNumber: `TEST114${id}`,
          createdAt: NOW,
          fileName: `${row.srNo}.pdf`,
          fileObjectKey: `test/donation-filings/${filing.id}/certificates/${id}.pdf`,
          fileSha256: id,
          filingId: filing.id,
          id,
          // Row 3 matched by details and still waits for review.
          ...(row.srNo === 3
            ? { matchedBy: "details" as const }
            : { confirmedAt: NOW, matchedBy: "details" as const }),
          rowId: row.id,
        });
      }
      const [emailed] = certificateIds as [string, string];
      const claim = (ids?: string[], now = NOW) =>
        claimCertificateEmails(tx, {
          certificateIds: ids,
          filingId: filing.id,
          now,
        });

      const first = await claim();
      expect(first.claimed.map((entry) => entry.certificateId)).toEqual([
        emailed,
      ]);
      expect(first.noEmail).toEqual(["Filing Test Donor"]);
      // Queued and not failed: a second click, or a resend, claims nothing;
      // the unconfirmed details match is never claimed.
      expect((await claim()).claimed).toEqual([]);
      expect((await claim([emailed])).claimed).toEqual([]);
      // Queued over an hour ago with no outcome: stuck, so claimed again.
      const stale = await claim(
        undefined,
        new Date(NOW.getTime() + 2 * 60 * 60 * 1000)
      );
      expect(stale.claimed.map((entry) => entry.certificateId)).toEqual([
        emailed,
      ]);
      // Under its original request, so Resend's idempotency key holds.
      expect(stale.claimed[0]?.requestId).toBe(first.claimed[0]?.requestId);

      // A failed send is claimed again, under a new request.
      await tx
        .update(donationCertificate)
        .set({ emailFailure: "failed" })
        .where(eq(donationCertificate.id, emailed));
      const retry = await claim();
      expect(retry.claimed).toHaveLength(1);
      expect(retry.claimed[0]?.requestId).not.toBe(first.claimed[0]?.requestId);

      // Sent: never again, unless resent explicitly.
      await tx
        .update(donationCertificate)
        .set({ emailedAt: NOW, emailFailure: null })
        .where(eq(donationCertificate.id, emailed));
      expect((await claim()).claimed).toEqual([]);
      const resend = await claim([emailed]);
      expect(resend.claimed.map((entry) => entry.certificateId)).toEqual([
        emailed,
      ]);
      const [state] = await tx
        .select({ emailedAt: donationCertificate.emailedAt })
        .from(donationCertificate)
        .where(eq(donationCertificate.id, emailed));
      expect(state?.emailedAt).toBeNull();
    });
  }
);

it.skipIf(!localDatabase)(
  "bulk-confirms only selected automatic PAN matches in a submitted filing, once",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { actorId, donor } = await fixture(tx);
      const donorId = await donor("donor@example.test");
      const filing = await record(
        tx,
        actorId,
        Array.from({ length: 6 }, (_, index) => ({
          ...planRow(donorId, [], index + 1),
          ...(index === 3
            ? { idCode: "Passport number", idType: "passport" as const }
            : {}),
        }))
      );
      const otherFiling = await record(tx, actorId, [planRow(donorId, [], 1)]);
      const rows = await tx
        .select({ id: donationFilingRow.id, srNo: donationFilingRow.srNo })
        .from(donationFilingRow)
        .where(eq(donationFilingRow.filingId, filing.id))
        .orderBy(donationFilingRow.srNo);
      const ids: string[] = [];
      for (const row of rows) {
        const id = uuidv7();
        ids.push(id);
        await tx.insert(donationCertificate).values({
          acknowledgementNumber: `TEST114${id}`,
          confirmedAt: row.srNo === 5 ? NOW : null,
          confirmedBy: row.srNo === 5 ? actorId : null,
          createdAt: NOW,
          fileName: `${row.srNo}.pdf`,
          fileObjectKey: `test/${id}.pdf`,
          fileSha256: id,
          filingId: filing.id,
          id,
          matchedBy: row.srNo === 3 ? "manual" : "details",
          rowId: row.id,
        });
      }
      const [otherRow] = await tx
        .select({ id: donationFilingRow.id })
        .from(donationFilingRow)
        .where(eq(donationFilingRow.filingId, otherFiling.id));
      if (!otherRow) throw new Error("Missing other filing row");
      const foreignId = uuidv7();
      await tx.insert(donationCertificate).values({
        acknowledgementNumber: `TEST114${foreignId}`,
        createdAt: NOW,
        fileName: "other.pdf",
        fileObjectKey: `test/${foreignId}.pdf`,
        fileSha256: foreignId,
        filingId: otherFiling.id,
        id: foreignId,
        matchedBy: "details",
        rowId: otherRow.id,
      });
      const certificateIds = [...ids.slice(0, 5), foreignId];
      const confirmedAt = new Date(NOW.getTime() + 60_000);
      const confirm = () =>
        confirmPanCertificates(tx, {
          certificateIds,
          filingId: filing.id,
          now: confirmedAt,
          userId: actorId,
        });
      await expect(confirm()).rejects.toThrow("submitted filing");
      await tx
        .update(donationFiling)
        .set({
          acknowledgementNumber: "TEST113",
          filedOn: "2097-06-01",
          status: "submitted",
          transactionId: "TESTTXN",
        })
        .where(eq(donationFiling.id, filing.id));
      expect(await confirm()).toBe(2);
      expect(await confirm()).toBe(0);
      const certificates = await tx
        .select()
        .from(donationCertificate)
        .where(eq(donationCertificate.filingId, filing.id));
      for (const [index, id] of ids.entries()) {
        const certificate = certificates.find((item) => item.id === id);
        expect(certificate?.confirmedAt).toEqual(
          index < 2 ? confirmedAt : index === 4 ? NOW : null
        );
        expect(certificate?.confirmedBy).toBe(
          index < 2 || index === 4 ? actorId : null
        );
        expect(certificate?.emailQueuedAt).toBeNull();
      }
      const [foreign] = await tx
        .select()
        .from(donationCertificate)
        .where(eq(donationCertificate.id, foreignId));
      expect(foreign?.confirmedAt).toBeNull();
    });
  }
);

it.skipIf(!localDatabase)(
  "reads a partial refund, so the gift is filed at its net amount and shows no drift",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const { actorId, donor, gift } = await fixture(tx);
      const donorId = await donor("donor@example.test");
      const giftId = await gift(donorId);
      await tx.insert(contributionRefund).values({
        amountPaise: 30_000,
        contributionId: giftId,
        createdAt: NOW,
        id: uuidv7(),
        refundedOn: "2097-05-10",
        source: "manual",
      });
      const facts = await loadReturnFacts(
        { endsOn: "2098-03-31", startsOn: "2097-04-01" },
        "none",
        tx
      );
      const facts0 = facts.gifts.find((entry) => entry.id === giftId);
      expect(facts0?.refundedPaise).toBe(30_000);
      const assessed = assessReturn(facts.gifts, facts.donors).gifts.find(
        (entry) => entry.id === giftId
      );
      expect(assessed?.netPaise).toBe(70_000);

      const filing = await record(
        tx,
        actorId,
        [{ ...planRow(donorId, [giftId], 1), amountPaise: 70_000 }],
        new Map([[giftId, assessed?.netPaise ?? 0]])
      );
      const [row] = await tx
        .select({
          amountPaise: donationFilingRow.amountPaise,
          id: donationFilingRow.id,
        })
        .from(donationFilingRow)
        .where(eq(donationFilingRow.filingId, filing.id));
      expect(row?.amountPaise).toBe(70_000);
      // Filed at net, so the refund already counted is no drift.
      expect((await loadFilingDrift([filing.id], tx)).size).toBe(0);
    });
  }
);
