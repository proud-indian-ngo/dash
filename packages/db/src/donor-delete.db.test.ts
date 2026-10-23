import { SQL } from "bun";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

import { deleteDonorInTransaction } from "./queries/party-private";
// biome-ignore lint/performance/noNamespaceImport: the test database needs the full Drizzle schema.
import * as schema from "./schema";
import { user } from "./schema/auth";
import {
  fund,
  orgAccount,
  programme,
  project,
} from "./schema/finance-dimensions";
import { contribution } from "./schema/income";
import { party, partyRole } from "./schema/party";
import { collectionEvent } from "./schema/private/imports";
import { partyPrivate } from "./schema/private/party-private";

/**
 * Database-backed donor delete checks. Opt in with
 * LEDGER_TEST_DATABASE_URL pointing at a local, migrated database. Every
 * test transaction is rolled back and uses synthetic records only.
 */

const databaseUrl = process.env.LEDGER_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

type Tx = Parameters<typeof deleteDonorInTransaction>[0];

async function inRolledBackTransaction(run: (tx: Tx) => Promise<void>) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client, schema });
  try {
    await database.transaction(async (tx) => {
      await run(tx as unknown as Tx);
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

const NOW = new Date("2026-10-14T06:00:00Z");

async function addDonor(tx: Tx, roles: ("donor" | "vendor")[] = ["donor"]) {
  const id = uuidv7();
  await tx.insert(party).values({
    createdAt: NOW,
    displayName: `Delete test donor ${id}`,
    id,
    kind: "person",
    updatedAt: NOW,
  });
  for (const role of roles) {
    await tx
      .insert(partyRole)
      .values({ active: true, id: uuidv7(), partyId: id, role, since: NOW });
  }
  await tx.insert(partyPrivate).values({ partyId: id, updatedAt: NOW });
  await tx.insert(collectionEvent).values({
    channel: "generic_csv",
    id: uuidv7(),
    occurredAt: NOW,
    partyId: id,
    processingBasis: "voluntary_provision_7a",
    purpose: "receipts",
  });
  return id;
}

const rowsOf = async (tx: Tx, id: string) => ({
  parties: await tx.select().from(party).where(eq(party.id, id)),
  private: await tx
    .select()
    .from(partyPrivate)
    .where(eq(partyPrivate.partyId, id)),
  roles: (
    await tx.select().from(partyRole).where(eq(partyRole.partyId, id))
  ).map((r) => r.role),
});

it.skipIf(!localDatabase)(
  "deletes a donor with its private details and collection events",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await addDonor(tx);
      expect(await deleteDonorInTransaction(tx, id)).toBe("party");
      expect(await rowsOf(tx, id)).toEqual({
        parties: [],
        private: [],
        roles: [],
      });
    });
  }
);

it.skipIf(!localDatabase)(
  "keeps a party that is also a vendor, removing only its donor roles",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await addDonor(tx, ["donor", "vendor"]);
      expect(await deleteDonorInTransaction(tx, id)).toBe("donor");
      const after = await rowsOf(tx, id);
      expect(after.parties).toHaveLength(1);
      expect(after.private).toHaveLength(1);
      expect(after.roles).toEqual(["vendor"]);
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a donor with gifts or a linked login",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const giver = await addDonor(tx);
      const fundId = uuidv7();
      const accountId = uuidv7();
      await tx.insert(fund).values({
        code: `DEL-${fundId}`,
        createdAt: NOW,
        id: fundId,
        name: `Delete test fund ${fundId}`,
        updatedAt: NOW,
      });
      await tx.insert(orgAccount).values({
        createdAt: NOW,
        id: accountId,
        kind: "bank",
        name: `Delete test bank ${accountId}`,
        updatedAt: NOW,
      });
      await tx.insert(contribution).values({
        amountPaise: 50_000,
        channel: "neft",
        createdAt: NOW,
        fundId,
        id: uuidv7(),
        orgAccountId: accountId,
        partyId: giver,
        receivedOn: "2026-10-10",
        reportingMode: "electronic_or_account_payee",
        source: "manual",
        status: "received",
        updatedAt: NOW,
      });
      await expect(deleteDonorInTransaction(tx, giver)).rejects.toThrow(
        "Cannot delete a donor with gifts"
      );

      const linked = await addDonor(tx);
      const [someone] = await tx.select({ id: user.id }).from(user).limit(1);
      if (!someone) {
        throw new Error("Seed a user first");
      }
      await tx
        .update(user)
        .set({ partyId: linked })
        .where(eq(user.id, someone.id));
      await expect(deleteDonorInTransaction(tx, linked)).rejects.toThrow(
        "linked to a user"
      );
    });
  }
);

it.skipIf(!localDatabase)(
  "refuses a vendor that sponsors a project, keeping its donor role",
  async () => {
    await inRolledBackTransaction(async (tx) => {
      const id = await addDonor(tx, ["donor", "vendor"]);
      const programmeId = uuidv7();
      await tx.insert(programme).values({
        code: `DEL-${programmeId}`,
        createdAt: NOW,
        id: programmeId,
        name: `Delete test programme ${programmeId}`,
        updatedAt: NOW,
      });
      const projectId = uuidv7();
      await tx.insert(project).values({
        code: `DEL-${projectId}`,
        createdAt: NOW,
        id: projectId,
        name: `Delete test project ${projectId}`,
        programmeId,
        sponsorPartyId: id,
        updatedAt: NOW,
      });
      await expect(deleteDonorInTransaction(tx, id)).rejects.toThrow(
        "linked to a project or grant"
      );
      expect((await rowsOf(tx, id)).roles.sort()).toEqual(["donor", "vendor"]);
    });
  }
);
