import { describe, expect, it } from "bun:test";

import {
  deedVersionQueries,
  governanceDocumentQueries,
  organisationRegistrationQueries,
  trusteeQueries,
} from "./governance";

function ctx(permissions: string[]) {
  return { permissions, role: "volunteer", userId: "user-1" };
}

function queryAst(query: unknown): string {
  return JSON.stringify((query as { ast: unknown }).ast);
}

const NEVER = '"value":"__never_match__"';

function governanceQueries(context: ReturnType<typeof ctx>) {
  return [
    trusteeQueries.all.fn({ args: undefined, ctx: context }),
    deedVersionQueries.all.fn({ args: undefined, ctx: context }),
    governanceDocumentQueries.all.fn({ args: undefined, ctx: context }),
    governanceDocumentQueries.byId.fn({ args: { id: "doc-1" }, ctx: context }),
  ];
}

describe("governance queries", () => {
  it("return nothing without governance.view or governance.manage", () => {
    for (const query of governanceQueries(ctx(["finance.view"]))) {
      expect(queryAst(query)).toContain(NEVER);
    }
    expect(
      queryAst(
        organisationRegistrationQueries.all.fn({
          args: undefined,
          ctx: ctx(["events.view_own"]),
        })
      )
    ).toContain(NEVER);
  });

  it("return the register to governance.view and governance.manage", () => {
    for (const permission of ["governance.view", "governance.manage"]) {
      for (const query of governanceQueries(ctx([permission]))) {
        expect(queryAst(query)).not.toContain(NEVER);
      }
    }
  });

  it("show registrations to finance as well", () => {
    for (const permission of ["finance.view", "finance.manage"]) {
      expect(
        queryAst(
          organisationRegistrationQueries.all.fn({
            args: undefined,
            ctx: ctx([permission]),
          })
        )
      ).not.toContain(NEVER);
    }
  });
});
