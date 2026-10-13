import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { runRetentionScope } from "./queries/income-import";

const BATCH = "0190a000-0000-7000-8000-000000000001";
const NEW_DATE = "2027-04-12";

const render = (source: "generic_csv" | "razorpay_api") =>
  new PgDialect().sqlToQuery(runRetentionScope(BATCH, source, NEW_DATE)!);

describe("retention after a run", () => {
  it("in a Razorpay day batch, dates only rows just decided, never an older decided row", () => {
    // An old decided row already has a retain_until; a payment decided
    // today has none. Only the second matches, so the first keeps its date.
    const query = render("razorpay_api");
    expect(query.sql).toContain('"retain_until" is null');
    expect(query.sql).toContain('"outcome" <> $');
    expect(query.sql).not.toContain('"retain_until" <');
    expect(query.params).toEqual([BATCH, "pending"]);
  });

  it("in a CSV batch, moves every earlier-dated row to the run's date", () => {
    const query = render("generic_csv");
    expect(query.sql).toContain('"retain_until" < $');
    expect(query.sql).toContain('"retain_until" is null');
    expect(query.params).toEqual([BATCH, NEW_DATE, "pending"]);
  });
});
