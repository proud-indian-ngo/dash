import { describe, expect, it } from "bun:test";

import { teamEventQueries } from "./team-event";

interface Ast {
  related?: { subquery: Ast & { alias?: string; table: string } }[];
  table: string;
  where?: unknown;
}

function relatedWhere(query: unknown, table: string): string {
  const { ast } = query as { ast: Ast };
  const sub = ast.related?.find((r) => r.subquery.table === table)?.subquery;
  if (!sub) {
    throw new Error(`No ${table} relation`);
  }
  return JSON.stringify(sub.where ?? null);
}

const run = (permissions: string[]) =>
  teamEventQueries.byIdWithExpenses.fn({
    args: { id: "event-1" },
    ctx: { permissions, role: "volunteer", userId: "vol-1" } as never,
  });

describe("teamEvent.byIdWithExpenses", () => {
  it("shows a viewer only their own requests and line items", () => {
    const query = run(["events.view_own"]);
    for (const table of ["reimbursement", "vendorPayment"]) {
      const where = relatedWhere(query, table);
      expect(where).toContain("userId");
      expect(where).toContain("vol-1");
    }
  });

  it("shows every request with requests.view_all", () => {
    const query = run(["requests.view_all"]);
    for (const table of ["reimbursement", "vendorPayment"]) {
      expect(relatedWhere(query, table)).not.toContain("vol-1");
    }
  });
});
