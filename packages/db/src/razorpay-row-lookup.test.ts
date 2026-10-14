import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { keepRazorpayPaymentIdSql } from "./import-retention";
import { lockImportBatchSql } from "./queries/income-import";
import { razorpayPaymentRowMatch } from "./queries/razorpay-import";

const render = (query: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  new PgDialect().sqlToQuery(query);

describe("Razorpay row lookup survives retention", () => {
  it("finds a payment's row by the kept payment ID, its values, or its identity", () => {
    const query = render(razorpayPaymentRowMatch("pay_A"));
    expect(query.sql).toContain('"import_row"."external_id" = $1');
    expect(query.sql).toContain(`"import_row"."raw"->>'id' = $2`);
    expect(query.sql).toContain('"external_identity"');
    expect(query.params).toEqual(["pay_A", "pay_A", "pay_A"]);
  });

  it("copies a Razorpay row's payment ID into external_id before raw is nulled", () => {
    const { sql, params } = render(keepRazorpayPaymentIdSql);
    expect(sql).toMatch(/^update "private"\."import_row"/);
    expect(sql).toContain(
      `set "external_id" = "private"."import_row"."raw"->>'id'`
    );
    expect(sql).toContain('"import_row"."external_id" is null');
    expect(sql).toContain("'razorpay_api'");
    expect(params).toEqual([]);
  });
});

describe("batch recount", () => {
  it("locks the batch row before counting, so a concurrent staging is never lost", () => {
    const { sql, params } = render(lockImportBatchSql("b-1"));
    expect(sql).toMatch(/where "import_batch"\."id" = \$1 for update$/);
    expect(params).toEqual(["b-1"]);
  });
});
