import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  linkSettlementLinesForPayment,
  linkSettlementLinesForRefund,
} from "./queries/razorpay-settlements";

/** A transaction that records the statements it is given. */
function recordingTx() {
  const statements: { params: unknown[]; sql: string }[] = [];
  const dialect = new PgDialect();
  return {
    statements,
    tx: {
      execute: async (query: SQL) => {
        statements.push(dialect.sqlToQuery(query));
        return [{ id: "line-1" }];
      },
    } as never,
  };
}

describe("settlement lines waiting for a payment or refund", () => {
  it("are linked to the contribution the payment just became, in its mode only", async () => {
    const { statements, tx } = recordingTx();
    expect(await linkSettlementLinesForPayment(tx, "live", "pay_A")).toBe(1);
    const [statement] = statements;
    expect(statement?.sql).toMatch(/^\s*update "gateway_settlement_item" i/);
    expect(statement?.sql).toContain(
      "set contribution_id = ei.contribution_id"
    );
    expect(statement?.sql).toContain('"private"."external_identity" ei');
    expect(statement?.sql).toContain("i.contribution_id is null");
    expect(statement?.sql).toContain("ei.entity_type = 'payment'");
    expect(statement?.sql).toContain(
      "ei.provider_account = s.provider_account"
    );
    expect(statement?.params).toEqual(["live", "pay_A"]);
  });

  it("are linked to the refund just recorded under the same Razorpay ID", async () => {
    const { statements, tx } = recordingTx();
    expect(await linkSettlementLinesForRefund(tx, "test", "rfnd_A")).toBe(1);
    const [statement] = statements;
    expect(statement?.sql).toContain("set contribution_refund_id = r.id");
    expect(statement?.sql).toContain('"contribution_refund" r');
    expect(statement?.sql).toContain("r.reference = i.external_id");
    expect(statement?.sql).toContain("i.contribution_refund_id is null");
    expect(statement?.params).toEqual(["test", "rfnd_A"]);
  });
});
