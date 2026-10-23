import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEDGER_FUNCTION_STATEMENTS,
  LEDGER_GUARD_VERSION,
  LEDGER_TRIGGERS,
} from "./immutability-sql";

/**
 * Changing the guards means bumping LEDGER_GUARD_VERSION and adding a new
 * custom migration whose name contains `ledger_guards` (generated from
 * immutability-sql.ts); this test always checks the latest such migration.
 */
const migrationsDir = join(import.meta.dirname, "../migrations");
const latestGuards = readdirSync(migrationsDir)
  .filter((name) => /^\d{4}_ledger_guards.*\.sql$/.test(name))
  .sort()
  .at(-1);
const migration = readFileSync(
  join(migrationsDir, latestGuards ?? "missing-ledger-guards-migration.sql"),
  "utf8"
);

describe("ledger guards", () => {
  it("installs in migrated databases exactly what push-built databases get", () => {
    expect(migration).toContain(LEDGER_GUARD_VERSION);
    for (const statement of LEDGER_FUNCTION_STATEMENTS) {
      expect(migration).toContain(`${statement};`);
    }
    for (const trigger of LEDGER_TRIGGERS) {
      expect(migration).toContain(`${trigger.create};`);
    }
  });
});
