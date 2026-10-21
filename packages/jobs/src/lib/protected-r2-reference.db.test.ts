import { describe, expect, it } from "bun:test";

import { appConfig } from "@pi-dash/db/schema/app-config";
import { RECEIPT_SETTINGS_CONFIG_KEY } from "@pi-dash/shared/receipts";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";

import { isProtectedR2ObjectReferenced } from "./protected-r2-reference";

/**
 * The reference check against a real database, for the receipt signature
 * branch: app_config holds plain-text values beside the receipt settings'
 * JSON, and settings saved before signatures have no key. Opt in with
 * RECEIPT_TEST_DATABASE_URL pointing at a local, migrated database; every
 * write rolls back.
 */

const databaseUrl = process.env.RECEIPT_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

const KEY = "test/attachments/receipt-signatures/reference-check.png";
const NOW = new Date("2097-06-01T06:00:00Z");

async function withSettings(
  values: Record<string, string>,
  check: (referenced: (key: string) => Promise<boolean>) => Promise<void>
) {
  const client = new SQL(databaseUrl as string, { max: 1 });
  const database = drizzle({ client });
  try {
    await database.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx
          .insert(appConfig)
          .values({ key, updatedAt: NOW, value })
          .onConflictDoUpdate({ set: { value }, target: appConfig.key });
      }
      await check((key) => isProtectedR2ObjectReferenced(key, tx as never));
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

describe.skipIf(!localDatabase)("receipt signature references", () => {
  it("finds the settings' signature beside plain-text config values", async () => {
    await withSettings(
      {
        // Not JSON: the cast must never reach it.
        e2e_reference_check_plain: "Proud Indian NGO",
        [RECEIPT_SETTINGS_CONFIG_KEY]: JSON.stringify({ signatureKey: KEY }),
      },
      async (referenced) => {
        expect(await referenced(KEY)).toBe(true);
        expect(await referenced(`${KEY}.other`)).toBe(false);
      }
    );
  });

  it("references nothing for settings saved before signatures, or a null key", async () => {
    await withSettings(
      { [RECEIPT_SETTINGS_CONFIG_KEY]: JSON.stringify({ orgName: "Trust" }) },
      async (referenced) => {
        expect(await referenced(KEY)).toBe(false);
      }
    );
    await withSettings(
      {
        [RECEIPT_SETTINGS_CONFIG_KEY]: JSON.stringify({ signatureKey: null }),
      },
      async (referenced) => {
        expect(await referenced(KEY)).toBe(false);
      }
    );
  });
});
