import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LEDGER_FUNCTION_STATEMENTS,
  LEDGER_TRIGGERS,
} from "./immutability-sql";

const migration = readFileSync(
  join(import.meta.dirname, "../migrations/0134_ledger_guards.sql"),
  "utf8"
);

describe("ledger guards", () => {
  it("installs in migrated databases exactly what push-built databases get", () => {
    for (const statement of LEDGER_FUNCTION_STATEMENTS) {
      expect(migration).toContain(`${statement};`);
    }
    for (const trigger of LEDGER_TRIGGERS) {
      expect(migration).toContain(`${trigger.create};`);
    }
  });

  it("guards all six books tables against TRUNCATE and the ledger against edits", () => {
    const names = LEDGER_TRIGGERS.map((t) => t.name);
    for (const table of [
      "posting",
      "ledger_entry",
      "account_movement",
      "movement_allocation",
      "fiscal_year_event",
      "opening_balance",
    ]) {
      expect(names).toContain(`${table}_no_truncate`);
    }
    expect(names).toContain("opening_balance_final");
    expect(names).toContain("fiscal_year_event_append_only");
  });
});
